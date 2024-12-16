import { Vector3 } from './types';

export type Matrix4 = number[][];

export class MatrixTransformer {
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

  static combineMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    const result: Matrix4 = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 1]
    ];
    
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i][j] = a[i][0] * b[0][j] + 
                       a[i][1] * b[1][j] + 
                       a[i][2] * b[2][j] + 
                       a[i][3] * b[3][j];
      }
    }
    return result;
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

  static transformPoint(point: Vector3, matrix: Matrix4): Vector3 | null {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || 
        !isFinite(point.x) || !isFinite(point.y)) {
      return null;
    }

    const [px, py, pz] = this.applyMatrix(matrix, [
      point.x, 
      point.y, 
      point.z ?? 0, 
      1
    ]);

    if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) {
      return null;
    }

    return { x: px, y: py, z: pz };
  }

  static getScaleFactor(matrix: Matrix4): number {
    const scaleX = Math.sqrt(
      matrix[0][0] * matrix[0][0] + 
      matrix[0][1] * matrix[0][1] + 
      matrix[0][2] * matrix[0][2]
    );
    const scaleY = Math.sqrt(
      matrix[1][0] * matrix[1][0] + 
      matrix[1][1] * matrix[1][1] + 
      matrix[1][2] * matrix[1][2]
    );
    return (scaleX + scaleY) / 2;
  }

  static transformAngle(angle: number, matrix: Matrix4): number {
    const rotationRad = Math.atan2(matrix[1][0], matrix[0][0]);
    const rotationDeg = (rotationRad * 180) / Math.PI;
    return (angle + rotationDeg) % 360;
  }

  static calculateBlockTransform(position: Vector3, rotation?: number, scale?: Vector3): Matrix4 {
    let matrix = this.createIdentityMatrix();
    
    // Apply translation
    matrix = this.combineMatrices(
      matrix,
      this.createTranslationMatrix(position.x, position.y, position.z ?? 0)
    );
    
    // Apply rotation if specified
    if (typeof rotation === 'number' && isFinite(rotation)) {
      matrix = this.combineMatrices(matrix, this.createRotationMatrix(rotation));
    }
    
    // Apply scale if specified
    if (scale) {
      matrix = this.combineMatrices(
        matrix,
        this.createScaleMatrix(
          scale.x ?? 1,
          scale.y ?? 1,
          scale.z ?? 1
        )
      );
    }
    
    return matrix;
  }
}
