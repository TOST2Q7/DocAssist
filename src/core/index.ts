/**
 * Публичное API ядра DocAssist для приложений.
 * Приложения импортируют всё отсюда: `import { useWorkspace, useVariables } from '@/core'`.
 */
export * from './config';
export * from './storage/types';
export * from './schema/docType';
export * from './schema/fields';
export * from './workspace/workspace';
export * from './workspace/docStore';
export * from './workspace/WorkspaceContext';
export * from './variables/types';
export * from './variables/variables';
export * from './outbox/outbox';
export * from './base/tree';
export * from './base/base';
export * from './people/people';
export * from './suggest/suggest';
export * from './tables/tables';
export * from './registry/types';
export * from './registry/badges';
export * from './util/download';
export * from './util/format';
export * from './util/id';
