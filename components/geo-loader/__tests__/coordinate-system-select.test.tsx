import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { CoordinateSystemSelect } from '../components/coordinate-system-select';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { MockErrorReporter } from './test-utils';
import { Severity } from '../utils/errors';

// Mock the Select component from radix-ui since it uses createPortal
jest.mock('@radix-ui/react-select', () => ({
  Root: ({ children, value, onValueChange }: any) => (
    <select data-testid="coordinate-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  Trigger: ({ children }: any) => <div>{children}</div>,
  Value: ({ children }: any) => <span>{children}</span>,
  Content: ({ children }: any) => <div>{children}</div>,
  Item: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

describe('CoordinateSystemSelect', () => {
  const mockOnChange = jest.fn();
  let errorReporter: MockErrorReporter;

  beforeEach(() => {
    mockOnChange.mockClear();
    errorReporter = new MockErrorReporter();
  });

  it('renders with default value', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.WGS84}
        onChange={mockOnChange}
        errorReporter={errorReporter}
      />
    );

    expect(screen.getByText('Coordinate System')).toBeInTheDocument();
    expect(screen.getByText('WGS84 (EPSG:4326)')).toBeInTheDocument();
  });

  it('shows detected system indicator when highlightValue is provided', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.WGS84}
        onChange={mockOnChange}
        highlightValue={COORDINATE_SYSTEMS.WGS84}
        errorReporter={errorReporter}
      />
    );

    expect(screen.getByText('Detected system')).toBeInTheDocument();
    expect(screen.getByText('This coordinate system was automatically detected based on the data.')).toBeInTheDocument();
  });

  it('shows help text for selected coordinate system', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.SWISS_LV95}
        onChange={mockOnChange}
        errorReporter={errorReporter}
      />
    );

    expect(screen.getByText(/Swiss LV95: Modern Swiss coordinate system/)).toBeInTheDocument();
    expect(screen.getByText(/7-digit coordinates/)).toBeInTheDocument();
  });

  it('validates coordinate system selection', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.WGS84}
        onChange={mockOnChange}
        errorReporter={errorReporter}
      />
    );

    const select = screen.getByTestId('coordinate-select');
    fireEvent.change(select, { target: { value: 'INVALID_SYSTEM' } });

    const errors = errorReporter.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Invalid coordinate system selected');
    expect(errors[0].severity).toBe(Severity.ERROR);
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('warns when changing from detected system', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.WGS84}
        onChange={mockOnChange}
        highlightValue={COORDINATE_SYSTEMS.WGS84}
        errorReporter={errorReporter}
      />
    );

    const select = screen.getByTestId('coordinate-select');
    fireEvent.change(select, { target: { value: COORDINATE_SYSTEMS.SWISS_LV95 } });

    const warnings = errorReporter.getWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe('Selected coordinate system differs from detected system');
    expect(warnings[0].severity).toBe(Severity.WARNING);
    expect(mockOnChange).toHaveBeenCalledWith(COORDINATE_SYSTEMS.SWISS_LV95);
  });

  it('logs coordinate system changes', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.WGS84}
        onChange={mockOnChange}
        errorReporter={errorReporter}
      />
    );

    const select = screen.getByTestId('coordinate-select');
    fireEvent.change(select, { target: { value: COORDINATE_SYSTEMS.SWISS_LV95 } });

    const infoMessages = errorReporter.getMessages().filter(m => m.severity === Severity.INFO);
    expect(infoMessages).toHaveLength(1);
    expect(infoMessages[0].message).toBe('Changing coordinate system');
    expect(infoMessages[0].context).toEqual({
      from: COORDINATE_SYSTEMS.WGS84,
      to: COORDINATE_SYSTEMS.SWISS_LV95
    });
    expect(mockOnChange).toHaveBeenCalledWith(COORDINATE_SYSTEMS.SWISS_LV95);
  });

  it('shows warning message when selected system differs from detected', () => {
    render(
      <CoordinateSystemSelect
        value={COORDINATE_SYSTEMS.SWISS_LV95}
        onChange={mockOnChange}
        highlightValue={COORDINATE_SYSTEMS.WGS84}
        errorReporter={errorReporter}
      />
    );

    expect(screen.getByText(/You've selected a different system than what was detected/)).toBeInTheDocument();
  });
});
