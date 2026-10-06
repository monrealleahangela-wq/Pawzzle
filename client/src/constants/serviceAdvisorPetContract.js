import contract from './serviceAdvisorPetContract.json';

export const PET_TYPE_OPTIONS = contract.petTypes;
export const PET_SIZE_OPTIONS = contract.sizes;
export const PET_COAT_LENGTH_OPTIONS = contract.coatLengths;
export const PET_COAT_TYPE_OPTIONS = contract.coatTypes;
export const PET_SERVICE_NEED_OPTIONS = contract.serviceNeeds;

const token = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const petTypeAliases = new Map(contract.petTypes.flatMap(option => option.aliases.map(alias => [token(alias), option.value])));

export const normalizePetProfileType = value => petTypeAliases.get(token(value)) || '';
