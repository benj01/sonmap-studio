import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { DxfStructureView } from '../components/dxf-structure-view';
import { MockErrorReporter, createMockDxfData } from './test-utils';
import { Severity } from '../utils/errors';
import { DxfData, DxfInsertEntity } from '../utils/dxf/types';

// Mock ScrollArea component since it uses createPortal
jest.mock('@radix-ui/react-scroll-area', () => ({
  Root: ({ children }: any) => <div>{children}</div>,
  Viewport: ({ children }: any) => <div>{children}</div>,
  Scrollbar: () => null,
  Corner: () => null,
}));

// Mock Switch component
jest.mock('@radix-ui/react-switch', () => ({
  Root: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
  ),
}));

describe('DxfStructureView', () => {
  const mockOnLayerToggle = jest.fn();
  const mockOnLayerVisibilityToggle = jest.fn();
  const mockOnTemplateSelect = jest.fn();
  const mockOnElementSelect = jest.fn();
  let errorReporter: MockErrorReporter;

  beforeEach(() => {
    mockOnLayerToggle.mockClear();
    mockOnLayerVisibilityToggle.mockClear();
    mockOnTemplateSelect.mockClear();
    mockOnElementSelect.mockClear();
    errorReporter = new MockErrorReporter();
  });

  it('renders DXF structure correctly', () => {
    const dxfData = createMockDxfData();
    
    render(
      <DxfStructureView
        dxfData={dxfData}
        selectedLayers={[]}
        onLayerToggle={mockOnLayerToggle}
        visibleLayers={[]}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        selectedTemplates={[]}
        onTemplateSelect={mockOnTemplateSelect}
        onElementSelect={mockOnElementSelect}
        errorReporter={errorReporter}
      />
    );

    // Check for main sections
    expect(screen.getByText('Detailing Symbol Styles')).toBeInTheDocument();
    expect(screen.getByText('Layers')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('Entity Types')).toBeInTheDocument();
  });

  it('reports warning for missing block references', () => {
    const dxfData = createMockDxfData();
    // Add an INSERT entity that references a non-existent block
    const invalidInsert: DxfInsertEntity = {
      type: 'INSERT',
      layer: 'Layer1',
      handle: 'invalid_block',
      position: { x: 0, y: 0, z: 0 },
      block: 'NonExistentBlock',
    };
    dxfData.entities.push(invalidInsert);

    render(
      <DxfStructureView
        dxfData={dxfData}
        selectedLayers={[]}
        onLayerToggle={mockOnLayerToggle}
        visibleLayers={[]}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        selectedTemplates={[]}
        onTemplateSelect={mockOnTemplateSelect}
        onElementSelect={mockOnElementSelect}
        errorReporter={errorReporter}
      />
    );

    const warnings = errorReporter.getWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe('Referenced block "NonExistentBlock" not found');
    expect(warnings[0].severity).toBe(Severity.WARNING);
    expect(warnings[0].context).toEqual({
      entityType: 'INSERT',
      layer: 'Layer1',
      blockName: 'NonExistentBlock'
    });
  });

  it('logs layer visibility changes', () => {
    const dxfData = createMockDxfData();
    
    render(
      <DxfStructureView
        dxfData={dxfData}
        selectedLayers={[]}
        onLayerToggle={mockOnLayerToggle}
        visibleLayers={[]}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        selectedTemplates={[]}
        onTemplateSelect={mockOnTemplateSelect}
        onElementSelect={mockOnElementSelect}
        errorReporter={errorReporter}
      />
    );

    // Find and click the visibility toggle for Layer1
    const visibilityToggles = screen.getAllByRole('checkbox');
    const layer1Toggle = visibilityToggles.find(toggle => 
      toggle.closest('div')?.textContent?.includes('Layer1')
    );
    fireEvent.click(layer1Toggle!);

    const infoMessages = errorReporter.getMessages().filter(m => m.severity === Severity.INFO);
    expect(infoMessages).toHaveLength(1);
    expect(infoMessages[0].message).toBe('Showed layer "Layer1"');
    expect(infoMessages[0].context).toEqual({
      layer: 'Layer1',
      entityCount: expect.any(Number)
    });
    expect(mockOnLayerVisibilityToggle).toHaveBeenCalledWith('Layer1', true);
  });

  it('logs layer selection changes', () => {
    const dxfData = createMockDxfData();
    
    render(
      <DxfStructureView
        dxfData={dxfData}
        selectedLayers={[]}
        onLayerToggle={mockOnLayerToggle}
        visibleLayers={[]}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        selectedTemplates={[]}
        onTemplateSelect={mockOnTemplateSelect}
        onElementSelect={mockOnElementSelect}
        errorReporter={errorReporter}
      />
    );

    // Find and click the selection toggle for Layer1
    const selectionToggles = screen.getAllByRole('checkbox');
    const layer1Toggle = selectionToggles.find(toggle => 
      toggle.closest('div')?.textContent?.includes('Layer1')
    );
    fireEvent.click(layer1Toggle!);

    const infoMessages = errorReporter.getMessages().filter(m => m.severity === Severity.INFO);
    expect(infoMessages).toHaveLength(1);
    expect(infoMessages[0].message).toBe('Selected layer "Layer1" for import');
    expect(infoMessages[0].context).toEqual({
      layer: 'Layer1',
      entityCount: expect.any(Number)
    });
    expect(mockOnLayerToggle).toHaveBeenCalledWith('Layer1', true);
  });

  it('logs template selection changes', () => {
    const dxfData = createMockDxfData();
    
    render(
      <DxfStructureView
        dxfData={dxfData}
        selectedLayers={[]}
        onLayerToggle={mockOnLayerToggle}
        visibleLayers={[]}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        selectedTemplates={[]}
        onTemplateSelect={mockOnTemplateSelect}
        onElementSelect={mockOnElementSelect}
        errorReporter={errorReporter}
      />
    );

    // Find and click the template toggle for LINE type
    const templateToggles = screen.getAllByRole('checkbox');
    const lineToggle = templateToggles.find(toggle => 
      toggle.closest('div')?.textContent?.includes('Lines')
    );
    fireEvent.click(lineToggle!);

    const infoMessages = errorReporter.getMessages().filter(m => m.severity === Severity.INFO);
    expect(infoMessages).toHaveLength(1);
    expect(infoMessages[0].message).toBe('Selected Lines as template');
    expect(infoMessages[0].context).toEqual({
      type: 'LINE',
      count: expect.any(Number)
    });
    expect(mockOnTemplateSelect).toHaveBeenCalledWith('LINE', true);
  });

  it('logs element selection', () => {
    const dxfData = createMockDxfData();
    
    render(
      <DxfStructureView
        dxfData={dxfData}
        selectedLayers={[]}
        onLayerToggle={mockOnLayerToggle}
        visibleLayers={[]}
        onLayerVisibilityToggle={mockOnLayerVisibilityToggle}
        selectedTemplates={[]}
        onTemplateSelect={mockOnTemplateSelect}
        onElementSelect={mockOnElementSelect}
        errorReporter={errorReporter}
      />
    );

    // Find and click a LINE element in Layer1
    const lineElement = screen.getByText('Lines').closest('div');
    fireEvent.click(lineElement!);

    const infoMessages = errorReporter.getMessages().filter(m => m.severity === Severity.INFO);
    expect(infoMessages).toHaveLength(1);
    expect(infoMessages[0].message).toBe('Selected Lines elements in layer "Layer1"');
    expect(infoMessages[0].context).toEqual({
      type: 'LINE',
      layer: 'Layer1',
      count: expect.any(Number)
    });
    expect(mockOnElementSelect).toHaveBeenCalledWith({ type: 'LINE', layer: 'Layer1' });
  });
});
