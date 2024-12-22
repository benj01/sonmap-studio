import type { CircleLayer, LineLayer, FillLayer } from 'mapbox-gl';

// Expression for checking if a feature has a warning
const warningCondition: any = ['==', ['get', 'hasWarning'], true];

// Style expressions for different layer types
const pointRadiusExpression: any = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10, ['case', warningCondition, 4, 3],
  15, ['case', warningCondition, 8, 6],
  20, ['case', warningCondition, 12, 10]
];

const pointColorExpression: any = [
  'case',
  warningCondition,
  '#ff4444',
  ['match',
    ['get', 'type'],
    'POINT', '#4a90e2',
    'INSERT', '#50e3c2',
    'TEXT', '#b8e986',
    '#4a90e2'  // default color
  ]
];

const lineWidthExpression: any = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10, ['case', warningCondition, 2, 1],
  15, ['case', warningCondition, 3, 2],
  20, ['case', warningCondition, 4, 3]
];

const lineColorExpression: any = [
  'case',
  warningCondition,
  '#ff4444',
  ['match',
    ['get', 'entityType'],  // Use entityType instead of type
    'LINE', '#4a90e2',
    'POLYLINE', '#50e3c2',
    'LWPOLYLINE', '#50e3c2', // Add explicit LWPOLYLINE handling
    'ARC', '#b8e986',
    '#4a90e2'  // default color
  ]
];

const fillOpacityExpression: any = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10, ['case', warningCondition, 0.4, 0.3],
  15, ['case', warningCondition, 0.5, 0.4],
  20, ['case', warningCondition, 0.6, 0.5]
];

const fillColorExpression: any = [
  'case',
  warningCondition,
  '#ff4444',
  ['match',
    ['get', 'entityType'],  // Use entityType instead of type
    'POLYGON', '#4a90e2',
    'CIRCLE', '#50e3c2',
    'LWPOLYLINE', '#50e3c2', // Add explicit LWPOLYLINE handling
    'HATCH', '#b8e986',
    '#4a90e2'  // default color
  ]
];

export const layerStyles = {
  point: {
    id: 'points',
    type: 'circle',
    paint: {
      'circle-radius': pointRadiusExpression,
      'circle-color': pointColorExpression,
      'circle-opacity': 0.8,
      'circle-stroke-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 1,
        15, 1.5,
        20, 2
      ],
      'circle-stroke-color': '#ffffff'
    }
  } as Omit<CircleLayer, 'source'>,

  line: {
    id: 'lines',
    type: 'line',
    paint: {
      'line-color': lineColorExpression,
      'line-width': lineWidthExpression,
      'line-opacity': 0.8,
      'line-blur': 0.5
    }
  } as Omit<LineLayer, 'source'>,

  polygon: {
    id: 'polygons',
    type: 'fill',
    paint: {
      'fill-color': fillColorExpression,
      'fill-opacity': fillOpacityExpression,
      'fill-outline-color': '#ffffff'
    }
  } as Omit<FillLayer, 'source'>,

  polygonOutline: {
    id: 'polygon-outlines',
    type: 'line',
    paint: {
      'line-color': lineColorExpression,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, ['case', warningCondition, 1, 0.5],
        15, ['case', warningCondition, 2, 1],
        20, ['case', warningCondition, 3, 1.5]
      ],
      'line-opacity': 0.8,
      'line-blur': 0.5
    }
  } as Omit<LineLayer, 'source'>
};

// Constants for feature processing
export const MAX_VISIBLE_FEATURES = 5000;

// Layer z-index order
export const LAYER_ORDER = [
  'polygons',
  'polygon-outlines',
  'lines',
  'points'
];
