export function usePreviewState({
  previewManager,
  viewportBounds,
  visibleLayers,
  initialBoundsSet,
  onUpdateBounds,
  onPreviewUpdate
}: UsePreviewStateProps): PreviewState {
  // ... existing state and refs ...

  useEffect(() => {
    if (!previewManager) return;

    // Skip updates if viewport bounds haven't changed significantly
    if (!haveBoundsChangedSignificantly(prevBoundsRef.current, viewportBounds)) {
      return;
    }

    // Check if enough time has passed since last update
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < MIN_UPDATE_INTERVAL) {
      // If we're updating too frequently, schedule an update for later
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        // This will trigger the effect again after MIN_UPDATE_INTERVAL
        prevBoundsRef.current = undefined;
      }, MIN_UPDATE_INTERVAL - (now - lastUpdateTimeRef.current));
      return;
    }

    // Clear previous timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Generate unique timestamp for this update
    const updateTimestamp = Date.now();
    lastUpdateRef.current = updateTimestamp;

    // Debounce viewport updates
    updateTimeoutRef.current = setTimeout(async () => {
      // Skip if component unmounted or newer update is pending
      if (!mountedRef.current || lastUpdateRef.current !== updateTimestamp) {
        return;
      }

      try {
        setState(prev => ({ ...prev, loading: true }));
        prevBoundsRef.current = viewportBounds;
        lastUpdateTimeRef.current = Date.now();

        // Update preview manager options
        previewManager.setOptions({
          viewportBounds,
          visibleLayers,
          enableCaching: true
        });

        // Get preview collections
        const collections = await previewManager.getPreviewCollections();
        
        // Skip if component unmounted or newer update is pending
        if (!mountedRef.current || lastUpdateRef.current !== updateTimestamp) {
          return;
        }

        if (!collections) {
          setState(prev => ({
            ...initialState,
            loading: false
          }));
          return;
        }

        // Only log significant state changes in development
        if (process.env.NODE_ENV === 'development') {
          const logger = LogManager.getInstance();
          const totalFeatures = (collections.points?.features.length || 0) +
                              (collections.lines?.features.length || 0) +
                              (collections.polygons?.features.length || 0);
          if (totalFeatures > 0) {
            logger.info('PreviewState', 'Updated collections', {
              totalFeatures,
              pointCount: collections.points?.features.length || 0,
              lineCount: collections.lines?.features.length || 0,
              polygonCount: collections.polygons?.features.length || 0
            });
          }
        }

        // Update state with new collections
        setState({
          points: collections.points || emptyCollection,
          lines: collections.lines || emptyCollection,
          polygons: collections.polygons || emptyCollection,
          totalCount: collections.totalCount || 0,
          loading: false,
          progress: 1
        });

        // Update bounds if needed
        if (!initialBoundsSet && collections.bounds && typeof onUpdateBounds === 'function') {
          onUpdateBounds(collections.bounds);
        }

        // Notify of preview update
        onPreviewUpdate?.();

      } catch (error) {
        // Only log errors
        const logger = LogManager.getInstance();
        logger.error('PreviewState', 'Failed to update preview', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    }, DEBOUNCE_TIME);

    // Cleanup function
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, onUpdateBounds, onPreviewUpdate]);

  return state;
} 