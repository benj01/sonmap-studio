import React, { useState } from 'react';
import { LayerInfo } from '../../core/processors/base/interfaces';
import { PreviewResult } from '../../core/preview/generator';

interface LayerControlsProps {
  layers: LayerInfo[];
  style: PreviewResult['style'];
  onLayerVisibilityChange: (layerId: string, visible: boolean) => void;
  onStyleChange: (layerId: string, style: any) => void;
}

interface LayerState {
  visible: boolean;
  expanded: boolean;
  color?: string;
  opacity?: number;
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  style,
  onLayerVisibilityChange,
  onStyleChange
}) => {
  const [layerStates, setLayerStates] = useState<Record<string, LayerState>>(() =>
    Object.fromEntries(
      layers.map(layer => [
        layer.name,
        { visible: true, expanded: false }
      ])
    )
  );

  const toggleVisibility = (layerId: string) => {
    setLayerStates(prev => {
      const newState = {
        ...prev,
        [layerId]: {
          ...prev[layerId],
          visible: !prev[layerId].visible
        }
      };
      onLayerVisibilityChange(layerId, !prev[layerId].visible);
      return newState;
    });
  };

  const toggleExpanded = (layerId: string) => {
    setLayerStates(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        expanded: !prev[layerId].expanded
      }
    }));
  };

  const updateStyle = (layerId: string, updates: Partial<LayerState>) => {
    setLayerStates(prev => {
      const newState = {
        ...prev,
        [layerId]: {
          ...prev[layerId],
          ...updates
        }
      };
      onStyleChange(layerId, {
        color: newState[layerId].color,
        opacity: newState[layerId].opacity
      });
      return newState;
    });
  };

  return (
    <div className="layer-controls">
      <h3>Layers</h3>
      {layers.map(layer => {
        const state = layerStates[layer.name];
        return (
          <div key={layer.name} className="layer-item">
            <div className="layer-header">
              <label className="layer-visibility">
                <input
                  type="checkbox"
                  checked={state.visible}
                  onChange={() => toggleVisibility(layer.name)}
                />
                {layer.name}
              </label>
              <button
                className="expand-button"
                onClick={() => toggleExpanded(layer.name)}
              >
                {state.expanded ? '▼' : '▶'}
              </button>
            </div>
            
            {state.expanded && (
              <div className="layer-details">
                <div className="style-control">
                  <label>
                    Color:
                    <input
                      type="color"
                      value={state.color || style.colors[0]}
                      onChange={e => updateStyle(layer.name, { color: e.target.value })}
                    />
                  </label>
                </div>
                <div className="style-control">
                  <label>
                    Opacity:
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={state.opacity || 0.8}
                      onChange={e => updateStyle(layer.name, { opacity: parseFloat(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="layer-info">
                  <p>Type: {layer.geometryType}</p>
                  <p>Features: {layer.featureCount}</p>
                </div>
                {layer.attributes.length > 0 && (
                  <div className="attributes-list">
                    <h4>Attributes</h4>
                    <ul>
                      {layer.attributes.map(attr => (
                        <li key={attr.name}>
                          {attr.name}: {attr.type}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <style jsx>{`
        .layer-controls {
          background: white;
          padding: 15px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          max-width: 300px;
        }
        
        h3 {
          margin: 0 0 15px 0;
          font-size: 16px;
        }
        
        .layer-item {
          margin-bottom: 10px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        
        .layer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .layer-visibility {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        
        .expand-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          font-size: 12px;
        }
        
        .layer-details {
          margin-top: 10px;
          padding-left: 20px;
        }
        
        .style-control {
          margin-bottom: 8px;
        }
        
        .style-control label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        
        .layer-info {
          font-size: 12px;
          color: #666;
        }
        
        .layer-info p {
          margin: 4px 0;
        }
        
        .attributes-list {
          margin-top: 10px;
        }
        
        .attributes-list h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        
        .attributes-list ul {
          margin: 0;
          padding-left: 20px;
          font-size: 12px;
        }
        
        .attributes-list li {
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}; 