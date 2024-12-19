import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { FormatSettings } from '../components/format-settings';
import { createMockErrorReporter } from './test-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { ErrorReporter } from '../utils/errors';
import { AnalyzeResult } from '../processors/base-processor';

describe('FormatSettings', () => {
  let errorReporter: ErrorReporter;
  let onOptionsChange: jest.Mock;

  beforeEach(() => {
    errorReporter = createMockErrorReporter();
    onOptionsChange = jest.fn();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      fileType: 'dxf',
      analysis: {
        layers: ['Layer1', 'Layer2'],
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        preview: {
          type: 'FeatureCollection',
          features: []
        }
      } as AnalyzeResult,
      options: {
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        selectedLayers: [],
        visibleLayers: [],
        errorReporter
      },
      onOptionsChange,
      errorReporter
    };

    return render(<FormatSettings {...defaultProps} {...props} />);
  };

  describe('coordinate system selection', () => {
    it('should report coordinate system changes', () => {
      renderComponent();

      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: COORDINATE_SYSTEMS.SWISS_LV95 }
      });

      const info = (errorReporter as any).getReportsByType('COORDINATE_SYSTEM');
      expect(info.length).toBe(1);
      expect(info[0].context).toMatchObject({
        from: COORDINATE_SYSTEMS.WGS84,
        to: COORDINATE_SYSTEMS.SWISS_LV95
      });
    });
  });

  describe('layer management', () => {
    it('should report error when no layers are available', () => {
      renderComponent({
        analysis: {
          layers: [],
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          preview: { 
            type: 'FeatureCollection', 
            features: [] 
          }
        } as AnalyzeResult
      });

      fireEvent.click(screen.getByLabelText('Select All'));

      const errors = (errorReporter as any).getReportsByType('LAYER_ERROR');
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('No layers available for selection');
    });

    it('should report layer selection changes', () => {
      renderComponent();

      fireEvent.click(screen.getByLabelText('Layer1'));

      const info = (errorReporter as any).getReportsByType('LAYER_SELECTION');
      expect(info.length).toBe(1);
      expect(info[0].context).toMatchObject({
        layer: 'Layer1',
        checked: true
      });
    });

    it('should report layer visibility changes', () => {
      renderComponent();

      fireEvent.click(screen.getByTestId('visibility-Layer1'));

      const info = (errorReporter as any).getReportsByType('LAYER_VISIBILITY');
      expect(info.length).toBe(1);
      expect(info[0].context).toMatchObject({
        layer: 'Layer1',
        checked: true
      });
    });
  });

  describe('CSV settings', () => {
    it('should report error for invalid delimiter', () => {
      renderComponent({ fileType: 'csv' });

      fireEvent.change(screen.getByPlaceholderText(/delimiter/i), {
        target: { value: 'too long' }
      });

      const warnings = (errorReporter as any).getReportsByType('DELIMITER_ERROR');
      expect(warnings.length).toBe(1);
      expect(warnings[0].message).toBe('Delimiter must be a single character');
    });

    it('should report error for invalid numeric input', () => {
      renderComponent({ fileType: 'csv' });

      fireEvent.change(screen.getByLabelText('Skip Rows'), {
        target: { value: '-1' }
      });

      const warnings = (errorReporter as any).getReportsByType('INPUT_ERROR');
      expect(warnings.length).toBe(1);
      expect(warnings[0].message).toBe('Value must be at least 0');
    });

    it('should report error for invalid simplification tolerance', () => {
      renderComponent({ fileType: 'csv' });

      fireEvent.change(screen.getByPlaceholderText(/simplification tolerance/i), {
        target: { value: '101' }
      });

      const warnings = (errorReporter as any).getReportsByType('INPUT_ERROR');
      expect(warnings.length).toBe(1);
      expect(warnings[0].message).toBe('Value must be at most 100');
    });
  });

  describe('format options updates', () => {
    it('should report format options changes', () => {
      renderComponent();

      fireEvent.click(screen.getByLabelText('Layer1'));

      const info = (errorReporter as any).getReportsByType('FORMAT_OPTIONS');
      expect(info.length).toBe(1);
      expect(info[0].context).toHaveProperty('previous');
      expect(info[0].context).toHaveProperty('updates');
      expect(info[0].context).toHaveProperty('new');
    });
  });
});
