import { Position } from 'geojson';
import { LogManager } from '../logging/log-manager';
import { CoordinateSystem } from '../../types/coordinates';

const logger = LogManager.getInstance();
const LOG_SOURCE = 'CoordinateSystemManager';

export class CoordinateSystemManager {
  // ... existing code ...

  public async transformCoordinates(
    coordinates: Position,
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem
  ): Promise<Position | null> {
    try {
      logger.debug('CoordinateSystemManager', 'Starting transformation', {
        fromSystem,
        toSystem,
        originalCoordinates: coordinates
      });

      // First transform to WGS84 if needed
      let intermediateCoords = coordinates;
      if (fromSystem !== 'EPSG:4326') {
        try {
          intermediateCoords = await this.transformToWGS84(coordinates, fromSystem);
          logger.debug('CoordinateSystemManager', 'WGS84 transformation', {
            original: coordinates,
            intermediate: intermediateCoords,
            success: !!intermediateCoords
          });
        } catch (error) {
          logger.error('CoordinateSystemManager', 'WGS84 transformation failed', {
            error,
            coordinates,
            fromSystem
          });
          return null;
        }
      }

      // Then transform to target system if needed
      let finalCoords = intermediateCoords;
      if (toSystem !== 'EPSG:4326') {
        try {
          finalCoords = await this.transformFromWGS84(intermediateCoords, toSystem);
          logger.debug('CoordinateSystemManager', 'Target transformation', {
            intermediate: intermediateCoords,
            final: finalCoords,
            success: !!finalCoords
          });
        } catch (error) {
          logger.error('CoordinateSystemManager', 'Target transformation failed', {
            error,
            coordinates: intermediateCoords,
            toSystem
          });
          return null;
        }
      }

      if (!finalCoords) {
        logger.warn('CoordinateSystemManager', 'Transformation produced null result', {
          fromSystem,
          toSystem,
          original: coordinates,
          intermediate: intermediateCoords
        });
        return null;
      }

      logger.debug('CoordinateSystemManager', 'Transformation complete', {
        original: coordinates,
        final: finalCoords,
        fromSystem,
        toSystem
      });

      return finalCoords;
    } catch (error) {
      logger.error('CoordinateSystemManager', 'Transformation error', {
        error,
        coordinates,
        fromSystem,
        toSystem
      });
      return null;
    }
  }
  // ... existing code ...
} 