export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
export { RegulatoryList } from './RegulatoryList.js';
export { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';
export { SubstanceListEntry } from './SubstanceListEntry.js';
export { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
export { BlindDisclosureRequest } from './BlindDisclosureRequest.js';
export { HazardClass, HazardType, SignalWord } from './HazardClass.js';
export { HazardStatement } from './HazardStatement.js';

// Import classes for entity array
import { RegistrySource } from './RegistrySource.js';
import { RegulatoryList } from './RegulatoryList.js';
import { SubstanceGroup, SubstanceGroupMember } from './SubstanceGroup.js';
import { SubstanceListEntry } from './SubstanceListEntry.js';
import { UnresolvedSubstance } from './UnresolvedSubstance.js';
import { BlindDisclosureRequest } from './BlindDisclosureRequest.js';
import { HazardClass } from './HazardClass.js';
import { HazardStatement } from './HazardStatement.js';

/**
 * GSR entities for ORM registration.
 * These are PUBLIC schema entities that should be added to the ORM config
 * when using GSR functionality.
 *
 * Usage in API server:
 * ```typescript
 * import { gsrEntities } from '@eurocomply/gsr';
 * const orm = await initOrm({ additionalEntities: gsrEntities });
 * ```
 */
export const gsrEntities = [
  RegistrySource,
  RegulatoryList,
  SubstanceGroup,
  SubstanceGroupMember,
  SubstanceListEntry,
  UnresolvedSubstance,
  BlindDisclosureRequest,
  HazardClass,
  HazardStatement,
];
