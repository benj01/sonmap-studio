// ... existing code ...
async process(file: File): Promise<ProcessorResult> {
  this.logger.debug(this.LOG_SOURCE, 'Starting shapefile processing', {
    fileName: file.name,
    fileSize: file.size
  });

  try {
    const result = await this.processShapefile(file);
    
    this.logger.debug(this.LOG_SOURCE, 'Shapefile processing completed', {
      featureCount: result.features.length,
      firstFeature: result.features[0] ? {
        type: result.features[0].geometry?.type,
        coordinates: result.features[0].geometry?.coordinates,
        properties: result.features[0].properties
      } : null,
      bounds: result.bounds,
      layers: result.layers
    });

    return result;
  } catch (error) {
    // ... existing code ...
  }
}
// ... existing code ...