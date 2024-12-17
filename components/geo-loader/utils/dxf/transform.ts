import { Matrix4, Vector3, DxfEntity, DxfInsertEntity, isVector3 } from './types';

export class TransformUtils {
  static createIdentityMatrix(): Matrix4 {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  static createTranslationMatrix(x: number, y: number, z: number): Matrix4 {
    return [
      [1, 0, 0, x],
      [0, 1, 0, y],
      [0, 0, 1, z],
      [0, 0, 0, 1]
    ];
  }

  static createRotationMatrix(angleInDegrees: number): Matrix4 {
    const angle = (angleInDegrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      [cos, -sin, 0, 0],
      [sin, cos, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  static createScaleMatrix(x: number, y: number, z: number): Matrix4 {
    return [
      [x, 0, 0, 0],
      [0, y, 0, 0],
      [0, 0, z, 0],
      [0, 0, 0, 1]
    ];
  }

  static createBlockTransformMatrix(insert: DxfInsertEntity): Matrix4 {
    // Create translation matrix from insert point
    const translationMatrix = this.createTranslationMatrix(
      insert.position.x,
      insert.position.y,
      insert.position.z || 0
    );

    // Create rotation matrix if rotation is specified
    const rotationMatrix = this.createRotationMatrix(insert.rotation || 0);

    // Create scale matrix if scale is specified
    const scale = insert.scale || { x: 1, y: 1, z: 1 };
    const scaleMatrix = this.createScaleMatrix(
      scale.x,
      scale.y,
      scale.z || 1
    );

    // Combine matrices: Translation * Rotation * Scale
    return this.combineTransformMatrices(
      translationMatrix,
      this.combineTransformMatrices(rotationMatrix, scaleMatrix)
    );
  }

  static combineTransformMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    return this.combineMatrices(a, b);
  }

  static combineMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    const result: Matrix4 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j] + a[i][3]*b[3][j];
      }
    }
    return result;
  }

  static transformPoint(point: Vector3, matrix: Matrix4): Vector3 | null {
    if (!isVector3(point)) {
      console.warn('Invalid point coordinates:', point);
      return null;
    }

    const [px, py, pz] = this.applyMatrix(matrix, [point.x, point.y, point.z ?? 0, 1]);
    if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) {
      console.warn('Invalid transformation result:', { px, py, pz });
      return null;
    }
    return { x: px, y: py, z: pz };
  }

  static applyMatrix(matrix: Matrix4, point: [number, number, number, number]): [number, number, number] {
    const result: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      result[i] = matrix[i][0] * point[0] +
                  matrix[i][1] * point[1] +
                  matrix[i][2] * point[2] +
                  matrix[i][3] * point[3];
    }
    if (result[3] === 0) {
      return [result[0], result[1], result[2]];
    }
    return [
      result[0] / result[3],
      result[1] / result[3],
      result[2] / result[3]
    ];
  }

  static getScaleFactor(matrix: Matrix4): number {
    const scaleX = Math.sqrt(matrix[0][0] * matrix[0][0] + matrix[0][1] * matrix[0][1] + matrix[0][2] * matrix[0][2]);
    const scaleY = Math.sqrt(matrix[1][0] * matrix[1][0] + matrix[1][1] * matrix[1][1] + matrix[1][2] * matrix[1][2]);
    return (scaleX + scaleY) / 2;
  }

  static transformAngle(angle: number, matrix: Matrix4): number {
    const rotationRad = Math.atan2(matrix[1][0], matrix[0][0]);
    const rotationDeg = (rotationRad * 180) / Math.PI;
    return (angle + rotationDeg) % 360;
  }

  static transformEntity(entity: DxfEntity, matrix: Matrix4): DxfEntity | null {
    try {
      switch (entity.type) {
        case '3DFACE': {
          const transformedVertices = entity.vertices.map(v => this.transformPoint(v, matrix));
          if (transformedVertices.some(v => v === null)) {
            console.warn(`Failed to transform 3DFACE entity handle "${entity.handle || 'unknown'}" due to invalid vertices.`);
            return null;
          }
          return {
            ...entity,
            vertices: transformedVertices as [Vector3, Vector3, Vector3, Vector3]
          };
        }

        case 'POINT': {
          const position = this.transformPoint(entity.position, matrix);
          if (!position) {
            console.warn(`Failed to transform POINT entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, position };
        }

        case 'LINE': {
          const start = this.transformPoint(entity.start, matrix);
          const end = this.transformPoint(entity.end, matrix);
          if (!start || !end) {
            console.warn(`Failed to transform LINE entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, start, end };
        }

        case 'POLYLINE':
        case 'LWPOLYLINE': {
          const vertices = entity.vertices
            .map(v => this.transformPoint(v, matrix))
            .filter((v): v is Vector3 => v !== null);
          if (vertices.length < 2) {
            console.warn(`Failed to transform POLYLINE entity handle "${entity.handle || 'unknown'}" - insufficient valid vertices.`);
            return null;
          }
          return { ...entity, vertices };
        }

        case 'CIRCLE': {
          const center = this.transformPoint(entity.center, matrix);
          if (!center) {
            console.warn(`Failed to transform CIRCLE center handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const radius = entity.radius * this.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) {
            console.warn(`Invalid transformed radius for CIRCLE entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, center, radius };
        }

        case 'ARC': {
          const center = this.transformPoint(entity.center, matrix);
          if (!center) {
            console.warn(`Failed to transform ARC center handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const radius = entity.radius * this.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) {
            console.warn(`Invalid transformed radius for ARC entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const startAngle = this.transformAngle(entity.startAngle, matrix);
          const endAngle = this.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) {
            console.warn(`Invalid transformed angles for ARC entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, center, radius, startAngle, endAngle };
        }

        case 'ELLIPSE': {
          const center = this.transformPoint(entity.center, matrix);
          const majorAxis = this.transformPoint(entity.majorAxis, matrix);
          if (!center || !majorAxis) {
            console.warn(`Failed to transform ELLIPSE handle "${entity.handle || 'unknown'}" - invalid center or majorAxis.`);
            return null;
          }
          const startAngle = this.transformAngle(entity.startAngle, matrix);
          const endAngle = this.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) {
            console.warn(`Invalid transformed angles for ELLIPSE entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return {
            ...entity,
            center,
            majorAxis,
            minorAxisRatio: entity.minorAxisRatio,
            startAngle,
            endAngle
          };
        }

        case 'INSERT': {
          const position = this.transformPoint(entity.position, matrix);
          if (!position) {
            console.warn(`Failed to transform INSERT entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const scaleFactor = this.getScaleFactor(matrix);
          return {
            ...entity,
            position,
            rotation: entity.rotation ? this.transformAngle(entity.rotation, matrix) : undefined,
            scale: entity.scale ? {
              x: entity.scale.x * scaleFactor,
              y: entity.scale.y * scaleFactor,
              z: (entity.scale.z || 1) * scaleFactor
            } : undefined
          };
        }

        default: {
          console.warn(`Unsupported entity type for transformation: ${entity.type}`);
          return null;
        }
      }
    } catch (error: any) {
      console.warn(`Error transforming entity type "${entity.type}" handle "${entity.handle || 'unknown'}":`, error?.message || error);
      return null;
    }
  }
}
