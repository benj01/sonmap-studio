// This file is now just a re-export of the modular DXF parser implementation
// We're keeping this file for backward compatibility
import createDxfParser, { DxfCoreParser, DxfData, DxfEntity, LayerInfo, Vector3 } from './dxf';

export type {
  DxfData,
  DxfEntity,
  LayerInfo,
  Vector3
};

export type DxfFileParser = DxfCoreParser;
export const createParser = createDxfParser;

export default createDxfParser;
