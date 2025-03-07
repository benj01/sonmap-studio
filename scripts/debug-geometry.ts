import fs from 'fs';
import path from 'path';
import type { Feature, Polygon, Geometry, MultiPolygon } from 'geojson';
import kinks from '@turf/kinks';
import buffer from '@turf/buffer';
import cleanCoords from '@turf/clean-coords';

// Function to read and parse the CSV file
function readCSVGeometry(filePath: string): Feature<Polygon> {
    console.log('Reading file:', filePath);
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    console.log(`Found ${lines.length} coordinate pairs`);
    
    // Parse coordinates from CSV
    const coordinates = lines.map(line => {
        const [x, y] = line.split(',').map(Number);
        return [x, y];
    });

    // Ensure the polygon is closed
    if (coordinates.length > 0 && 
        (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
         coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
        coordinates.push([...coordinates[0]]);
    }

    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
        },
        properties: {}
    };
}

function validateAndRepairGeometry(geometry: Geometry): { 
    geometry: Geometry | null; 
    wasRepaired: boolean;
    wasCleaned: boolean;
    error?: string;
} {
    try {
        // Only process polygon geometries
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
            return { geometry, wasRepaired: false, wasCleaned: false };
        }

        const feature: Feature<Polygon | MultiPolygon> = {
            type: 'Feature',
            geometry: geometry as Polygon | MultiPolygon,
            properties: {}
        };

        // First clean duplicate vertices with a small tolerance
        let cleaned = feature;
        let wasCleaned = false;

        try {
            // Function to clean near-duplicate points within a tolerance
            const cleanWithTolerance = (coords: number[][]): number[][] => {
                const tolerance = 0.0000002; // About 2cm in degrees at Swiss latitude
                const result: number[][] = [];
                let lastPoint: number[] | null = null;

                for (const point of coords) {
                    if (!lastPoint) {
                        result.push(point);
                        lastPoint = point;
                        continue;
                    }

                    // Check if point is too close to last point
                    const dx = point[0] - lastPoint[0];
                    const dy = point[1] - lastPoint[1];
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > tolerance) {
                        result.push(point);
                        lastPoint = point;
                    } else {
                        console.log('Removed near-duplicate point', {
                            distance,
                            tolerance,
                            point,
                            lastPoint
                        });
                    }
                }

                // Ensure the ring is closed
                if (result.length > 0) {
                    result.push([...result[0]]);
                }

                return result;
            };

            // Clean each ring of the polygon
            if (geometry.type === 'Polygon') {
                const cleanedCoords = geometry.coordinates.map(ring => cleanWithTolerance(ring));
                cleaned = {
                    ...feature,
                    geometry: {
                        type: 'Polygon',
                        coordinates: cleanedCoords
                    }
                };
            } else {
                const cleanedCoords = geometry.coordinates.map(poly => 
                    poly.map(ring => cleanWithTolerance(ring))
                );
                cleaned = {
                    ...feature,
                    geometry: {
                        type: 'MultiPolygon',
                        coordinates: cleanedCoords
                    }
                };
            }

            // Then apply standard clean-coords to catch any remaining issues
            cleaned = cleanCoords(cleaned);
            
            // Check if cleaning made any changes
            wasCleaned = JSON.stringify(cleaned.geometry) !== JSON.stringify(feature.geometry);
            
            if (wasCleaned) {
                console.log('Cleaned duplicate/near-duplicate vertices from geometry');
            }
        } catch (error) {
            console.warn('Failed to clean vertices', error);
            // Continue with original geometry if cleaning fails
            cleaned = feature;
        }

        // Check for self-intersections
        const intersections = kinks(cleaned);
        
        if (intersections.features.length > 0) {
            console.log('Found self-intersections in geometry', {
                intersectionCount: intersections.features.length
            });

            try {
                // Try to repair using buffer with a small negative then positive value
                const bufferedNeg = buffer(cleaned, -0.00002, { units: 'degrees' });
                if (!bufferedNeg) {
                    return { 
                        geometry: null, 
                        wasRepaired: false,
                        wasCleaned,
                        error: 'Failed to repair self-intersecting polygon' 
                    };
                }
                
                const buffered = buffer(bufferedNeg, 0.00002, { units: 'degrees' });
                if (!buffered) {
                    return { 
                        geometry: null, 
                        wasRepaired: false,
                        wasCleaned,
                        error: 'Failed to repair self-intersecting polygon' 
                    };
                }

                return { 
                    geometry: buffered.geometry, 
                    wasRepaired: true,
                    wasCleaned 
                };
            } catch (error) {
                console.warn('Failed to validate/repair geometry', {
                    error,
                    geometryType: geometry.type,
                    ringCount: geometry.type === 'Polygon' ? geometry.coordinates.length : undefined
                });
                throw error;
            }
        }

        return { 
            geometry: cleaned.geometry, 
            wasRepaired: false,
            wasCleaned
        };

    } catch (error) {
        console.warn('Failed to validate/repair geometry', {
            error,
            geometryType: geometry.type,
            ringCount: geometry.type === 'Polygon' ? geometry.coordinates.length : undefined
        });
        return { 
            geometry: null, 
            wasRepaired: false,
            wasCleaned: false
        };
    }
}

async function debugGeometry() {
    console.time('Total processing time');
    
    try {
        // Read the geometry from CSV
        const csvPath = path.join(__dirname, '../test-data/638.csv');
        console.log('\nReading geometry from CSV...');
        const geometry = readCSVGeometry(csvPath);
        
        console.log('\nOriginal geometry stats:');
        console.log(`- Number of points: ${geometry.geometry.coordinates[0].length}`);
        
        // Add timing for kinks detection
        console.log('\nChecking for self-intersections...');
        console.time('Kinks detection time');
        const intersections = kinks(geometry);
        console.timeEnd('Kinks detection time');
        console.log(`- Found ${intersections.features.length} self-intersections`);
        
        if (intersections.features.length > 0) {
            console.log('Self-intersection points:');
            intersections.features.forEach((f, i) => {
                console.log(`  ${i + 1}. [${f.geometry.coordinates.join(', ')}]`);
            });
        }
        
        // Try to validate and repair with timing
        console.log('\nAttempting to validate and repair geometry...');
        console.time('Validation and repair time');
        
        const result = validateAndRepairGeometry(geometry.geometry);
        
        console.timeEnd('Validation and repair time');
        
        if (result.error) {
            console.error('Error during validation:', result.error);
        } else {
            console.log('\nProcessing results:');
            console.log(`- Was repaired: ${result.wasRepaired}`);
            console.log(`- Was cleaned: ${result.wasCleaned}`);
            
            if (result.geometry && result.geometry.type === 'Polygon') {
                console.log(`- Resulting point count: ${result.geometry.coordinates[0].length}`);
            }
        }
        
    } catch (error) {
        console.error('Fatal error during processing:', error);
        if (error instanceof Error) {
            console.error('Stack trace:', error.stack);
        }
    }
    
    console.timeEnd('Total processing time');
}

// Run the debug process
debugGeometry().catch(console.error); 