import { geoErrorManager } from '../../core/error-manager';
import { ErrorSeverity } from '../../../../types/errors';

describe('GeoErrorManager', () => {
  beforeEach(() => {
    geoErrorManager.clear();
  });

  describe('error tracking', () => {
    it('should add and retrieve errors', () => {
      geoErrorManager.addError(
        'test_context',
        'TEST_ERROR',
        'Test error message',
        ErrorSeverity.ERROR
      );

      const errors = geoErrorManager.getErrors('test_context');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('TEST_ERROR');
      expect(errors[0].message).toBe('Test error message');
      expect(errors[0].severity).toBe(ErrorSeverity.ERROR);
    });

    it('should track multiple errors in same context', () => {
      geoErrorManager.addError(
        'test_context',
        'ERROR_1',
        'First error',
        ErrorSeverity.ERROR
      );
      geoErrorManager.addError(
        'test_context',
        'ERROR_2',
        'Second error',
        ErrorSeverity.ERROR
      );

      const errors = geoErrorManager.getErrors('test_context');
      expect(errors).toHaveLength(2);
    });

    it('should track errors across different contexts', () => {
      geoErrorManager.addError(
        'context_1',
        'ERROR_1',
        'Error in context 1',
        ErrorSeverity.ERROR
      );
      geoErrorManager.addError(
        'context_2',
        'ERROR_2',
        'Error in context 2',
        ErrorSeverity.ERROR
      );

      expect(geoErrorManager.getErrors('context_1')).toHaveLength(1);
      expect(geoErrorManager.getErrors('context_2')).toHaveLength(1);
      expect(geoErrorManager.getErrors()).toHaveLength(2);
    });
  });

  describe('error filtering', () => {
    beforeEach(() => {
      geoErrorManager.addError(
        'test_context',
        'ERROR_1',
        'Error message',
        ErrorSeverity.ERROR
      );
      geoErrorManager.addError(
        'test_context',
        'WARNING_1',
        'Warning message',
        ErrorSeverity.WARNING
      );
      geoErrorManager.addError(
        'test_context',
        'CRITICAL_1',
        'Critical message',
        ErrorSeverity.CRITICAL
      );
    });

    it('should filter by severity', () => {
      const criticalErrors = geoErrorManager.getErrors('test_context', {
        severity: ErrorSeverity.CRITICAL
      });
      expect(criticalErrors).toHaveLength(1);
      expect(criticalErrors[0].code).toBe('CRITICAL_1');
    });

    it('should filter by code', () => {
      const errors = geoErrorManager.getErrors('test_context', {
        code: 'ERROR_1'
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('ERROR_1');
    });

    it('should filter by age', () => {
      const oldError = {
        code: 'OLD_ERROR',
        message: 'Old error',
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours old
        context: {}
      };

      // Directly manipulate error timestamp for testing
      const errors = geoErrorManager['errors'].get('test_context')!;
      errors.get('OLD_ERROR')!.errors.push(oldError);

      const recentErrors = geoErrorManager.getErrors('test_context', {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      expect(recentErrors.find(e => e.code === 'OLD_ERROR')).toBeUndefined();
    });
  });

  describe('error summary', () => {
    beforeEach(() => {
      // Add multiple errors of same type
      for (let i = 0; i < 3; i++) {
        geoErrorManager.addError(
          'test_context',
          'REPEATED_ERROR',
          'Repeated error message',
          ErrorSeverity.ERROR
        );
      }
    });

    it('should generate error summary', () => {
      const summary = geoErrorManager.getErrorSummary('test_context');
      expect(summary).toHaveLength(1);
      expect(summary[0].code).toBe('REPEATED_ERROR');
      expect(summary[0].count).toBe(3);
    });

    it('should sort summary by last occurrence', () => {
      geoErrorManager.addError(
        'test_context',
        'NEWER_ERROR',
        'Newer error message',
        ErrorSeverity.ERROR
      );

      const summary = geoErrorManager.getErrorSummary('test_context');
      expect(summary[0].code).toBe('NEWER_ERROR');
    });
  });

  describe('error management', () => {
    it('should clear errors by context', () => {
      geoErrorManager.addError(
        'context_1',
        'ERROR_1',
        'Error in context 1',
        ErrorSeverity.ERROR
      );
      geoErrorManager.addError(
        'context_2',
        'ERROR_2',
        'Error in context 2',
        ErrorSeverity.ERROR
      );

      geoErrorManager.clear('context_1');
      expect(geoErrorManager.getErrors('context_1')).toHaveLength(0);
      expect(geoErrorManager.getErrors('context_2')).toHaveLength(1);
    });

    it('should clear all errors', () => {
      geoErrorManager.addError(
        'context_1',
        'ERROR_1',
        'Error in context 1',
        ErrorSeverity.ERROR
      );
      geoErrorManager.addError(
        'context_2',
        'ERROR_2',
        'Error in context 2',
        ErrorSeverity.ERROR
      );

      geoErrorManager.clear();
      expect(geoErrorManager.getErrors()).toHaveLength(0);
    });

    it('should clear old errors', () => {
      const oldError = {
        code: 'OLD_ERROR',
        message: 'Old error',
        severity: ErrorSeverity.ERROR,
        timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours old
        context: {}
      };

      // Add old error
      const errors = geoErrorManager['errors'].get('test_context')!;
      errors.get('OLD_ERROR')!.errors.push(oldError);

      geoErrorManager.clearOldErrors();
      expect(geoErrorManager.getErrors().find(e => e.code === 'OLD_ERROR')).toBeUndefined();
    });
  });

  describe('error statistics', () => {
    beforeEach(() => {
      geoErrorManager.addError(
        'test_context',
        'ERROR_1',
        'Error message',
        ErrorSeverity.ERROR
      );
      geoErrorManager.addError(
        'test_context',
        'CRITICAL_1',
        'Critical message',
        ErrorSeverity.CRITICAL
      );
    });

    it('should count total errors', () => {
      expect(geoErrorManager.getErrorCount()).toBe(2);
      expect(geoErrorManager.getErrorCount('test_context')).toBe(2);
    });

    it('should count critical errors', () => {
      expect(geoErrorManager.getCriticalErrorCount()).toBe(1);
      expect(geoErrorManager.getCriticalErrorCount('test_context')).toBe(1);
    });

    it('should track error contexts', () => {
      geoErrorManager.addError(
        'another_context',
        'ERROR_2',
        'Error in another context',
        ErrorSeverity.ERROR
      );

      const contexts = geoErrorManager.getContexts();
      expect(contexts).toContain('test_context');
      expect(contexts).toContain('another_context');
    });
  });
});
