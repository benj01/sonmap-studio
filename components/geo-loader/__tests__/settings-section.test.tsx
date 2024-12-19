import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { SettingsSection } from '../components/geo-import/settings-section';
import { MockErrorReporter, createMockDxfData, createMockAnalysis, createMockFile } from './test-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { Severity } from '../utils/errors';

// Mock child components to simplify testing
jest.mock('../components/coordinate-system-select', () => ({
  CoordinateSystemSelect: ({ value, onChange, errorReporter }: any) => (
    <select
      data-testid="coordinate-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value={COORDINATE_SYSTEMS.WGS84}>WGS84</option>
      <option value={COORDINATE_SYSTEMS.SWISS_LV95}>Swiss LV95</option>
    </select>
  ),
}));

jest.mock('../components/dxf-structure-view', () => ({
  DxfStructureView: ({ dxfData, onLayerToggle, errorReporter }: any) => (
    <div data-testid="dxf-structure">
      {dxfData.entities.map((entity: any) => (
        <div key={entity.handle}>
          <input
            type="checkbox"
            onChange={(e) => onLayerToggle(entity.layer, e.target.checked)}
          />
          {entity.layer}
        </div>
      ))}
    </div>
  ),
}));

describe('SettingsSection', () => {
  const mockOnLayerToggle = jest.fn();
  const mockOnLayerVisibilityToggle = jest.fn();
  const mockOnTemplateSelect = jest.fn();
  const mockOnCoordinateSystemChange = jest.fn();
  const mockOnApplyCoordinateSystem = jest.fn();
  let errorReporter: MockErrorReporter;

  beforeEach(() => {
    mockOnLayerToggle.mockClear();
    mockOnLayerVisibilityToggle.mockClear();
    mockOnTemplateSelect.mockClear();
    mockOnCoordinateSystemChange.mockClear();
    mockOnApplyCoordinateSystem.mockClear();
    errorReporter = new MockErrorReporter();
  });

  it('warns about invalid WGS84 coordinates', () => {
    const analysis = createMockAnalysis({
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      bounds: {
        minX: -200,
        minY: -100,
        maxX: 200,
        maxY: 100,
      },
    });

    render(
      <SettingsSection
        file={createMockFile('test.dxf')}
        dxfData={createMockDxfData()}
        analysis={analysis}
        options={{
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: [],
        }}
        selectedLayers={[]}
        visibleLayers={[]}
        selectedTemplates={[]}
        onLayerToggle={mockOnLayerToggle}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        onTemplateSelect={mockOnTemplateSelect}
        onCoordinateSystemChange={mockOnCoordinateSystemChange}
        errorReporter={errorReporter}
      />
    );

    // Check for warning message
    expect(screen.getByText(/coordinates appear to be outside the valid WGS84 range/i)).toBeInTheDocument();

    // Check that warning was logged
    const warnings = errorReporter.getWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe('Coordinates appear to be outside the valid WGS84 range');
    expect(warnings[0].context).toEqual({
      bounds: analysis.bounds,
      currentSystem: analysis.coordinateSystem,
    });
  });

  it('handles coordinate system changes', async () => {
    const mockApply = jest.fn().mockResolvedValue(undefined);

    render(
      <SettingsSection
        file={createMockFile('test.dxf')}
        dxfData={createMockDxfData()}
        analysis={createMockAnalysis()}
        options={{
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: [],
        }}
        selectedLayers={[]}
        visibleLayers={[]}
        selectedTemplates={[]}
        onLayerToggle={mockOnLayerToggle}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        onTemplateSelect={mockOnTemplateSelect}
        onCoordinateSystemChange={mockOnCoordinateSystemChange}
        onApplyCoordinateSystem={mockApply}
        pendingCoordinateSystem={COORDINATE_SYSTEMS.SWISS_LV95}
        errorReporter={errorReporter}
      />
    );

    // Find and click the Apply button
    const applyButton = screen.getByText('Apply Coordinate System');
    fireEvent.click(applyButton);

    // Wait for the async operation to complete
    await screen.findByText('Applying...');

    // Check that success message was logged
    const infoMessages = errorReporter.getMessages().filter(m => m.severity === Severity.INFO);
    expect(infoMessages).toHaveLength(1);
    expect(infoMessages[0].message).toBe(`Successfully applied coordinate system: ${COORDINATE_SYSTEMS.SWISS_LV95}`);
    expect(infoMessages[0].context).toEqual({
      from: COORDINATE_SYSTEMS.WGS84,
      to: COORDINATE_SYSTEMS.SWISS_LV95,
    });

    expect(mockApply).toHaveBeenCalled();
  });

  it('handles coordinate system application errors', async () => {
    const mockError = new Error('Failed to apply coordinate system');
    const mockApply = jest.fn().mockRejectedValue(mockError);

    render(
      <SettingsSection
        file={createMockFile('test.dxf')}
        dxfData={createMockDxfData()}
        analysis={createMockAnalysis()}
        options={{
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: [],
        }}
        selectedLayers={[]}
        visibleLayers={[]}
        selectedTemplates={[]}
        onLayerToggle={mockOnLayerToggle}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        onTemplateSelect={mockOnTemplateSelect}
        onCoordinateSystemChange={mockOnCoordinateSystemChange}
        onApplyCoordinateSystem={mockApply}
        pendingCoordinateSystem={COORDINATE_SYSTEMS.SWISS_LV95}
        errorReporter={errorReporter}
      />
    );

    // Find and click the Apply button
    const applyButton = screen.getByText('Apply Coordinate System');
    fireEvent.click(applyButton);

    // Wait for the async operation to complete
    await screen.findByText('Apply Coordinate System');

    // Check that error was logged
    const errors = errorReporter.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Failed to apply coordinate system');
    expect(errors[0].error).toBe(mockError);
    expect(errors[0].context).toEqual({
      from: COORDINATE_SYSTEMS.WGS84,
      to: COORDINATE_SYSTEMS.SWISS_LV95,
    });
  });

  it('shows DXF structure for DXF files', () => {
    render(
      <SettingsSection
        file={createMockFile('test.dxf')}
        dxfData={createMockDxfData()}
        analysis={createMockAnalysis()}
        options={{
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: [],
        }}
        selectedLayers={[]}
        visibleLayers={[]}
        selectedTemplates={[]}
        onLayerToggle={mockOnLayerToggle}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        onTemplateSelect={mockOnTemplateSelect}
        onCoordinateSystemChange={mockOnCoordinateSystemChange}
        errorReporter={errorReporter}
      />
    );

    expect(screen.getByTestId('dxf-structure')).toBeInTheDocument();
  });

  it('does not show DXF structure for non-DXF files', () => {
    render(
      <SettingsSection
        file={createMockFile('test.csv')}
        dxfData={createMockDxfData()}
        analysis={createMockAnalysis()}
        options={{
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: [],
        }}
        selectedLayers={[]}
        visibleLayers={[]}
        selectedTemplates={[]}
        onLayerToggle={mockOnLayerToggle}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        onTemplateSelect={mockOnTemplateSelect}
        onCoordinateSystemChange={mockOnCoordinateSystemChange}
        errorReporter={errorReporter}
      />
    );

    expect(screen.queryByTestId('dxf-structure')).not.toBeInTheDocument();
  });

  it('handles missing onApplyCoordinateSystem callback', () => {
    render(
      <SettingsSection
        file={createMockFile('test.dxf')}
        dxfData={createMockDxfData()}
        analysis={createMockAnalysis()}
        options={{
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: [],
        }}
        selectedLayers={[]}
        visibleLayers={[]}
        selectedTemplates={[]}
        onLayerToggle={mockOnLayerToggle}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        onTemplateSelect={mockOnTemplateSelect}
        onCoordinateSystemChange={mockOnCoordinateSystemChange}
        pendingCoordinateSystem={COORDINATE_SYSTEMS.SWISS_LV95}
        errorReporter={errorReporter}
      />
    );

    // Find and click the Apply button
    const applyButton = screen.getByText('Apply Coordinate System');
    fireEvent.click(applyButton);

    // Check that error was logged
    const errors = errorReporter.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Cannot apply coordinate system: onApplyCoordinateSystem callback is not defined');
  });
});
