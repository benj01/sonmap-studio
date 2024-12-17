import type { CircleLayer, LineLayer, FillLayer } from 'mapbox-gl';

// Expression for checking if a feature has a warning
const warningCondition: any = ['==', ['get', 'hasWarning'], true];

// Style expressions for different layer types
const pointRadiusExpression: any = ['case', warningCondition, 8, 6];
const pointColorExpression: any = ['case', warningCondition, '#ff4444', '#007cbf'];
const lineWidthExpression: any = ['case', warningCondition, 3, 2];
const lineColorExpression: any = ['case', warningCondition, '#ff4444', '#007cbf'];
const fillOpacityExpression: any = ['case', warningCondition, 0.5, 0.4];

export const layerStyles = {
  point: {
    id: 'points',
    type: 'circle',
    paint: {
      'circle-radius': pointRadiusExpression,
      'circle-color': pointColorExpression,
      'circle-opacity': 0.8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff'
    }
  } as Omit<CircleLayer, 'source'>,

  line: {
    id: 'lines',
    type: 'line',
    paint: {
      'line-color': lineColorExpression,
      'line-width': lineWidthExpression,
      'line-opacity': 0.8
    }
  } as Omit<LineLayer, 'source'>,

  polygon: {
    id: 'polygons',
    type: 'fill',
    paint: {
      'fill-color': lineColorExpression,
      'fill-opacity': fillOpacityExpression,
      'fill-outline-color': '#fff'
    }
  } as Omit<FillLayer, 'source'>,

  polygonOutline: {
    id: 'polygon-outlines',
    type: 'line',
    paint: {
      'line-color': lineColorExpression,
      'line-width': ['case', warningCondition, 2, 1],
      'line-opacity': 0.8
    }
  } as Omit<LineLayer, 'source'>
};

// Constants for feature processing
export const MAX_VISIBLE_FEATURES = 5000;
