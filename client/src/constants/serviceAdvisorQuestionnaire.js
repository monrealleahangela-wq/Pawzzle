import contract from './serviceAdvisorQuestionnaire.json';

export const SERVICE_ADVISOR_BUDGET_OPTIONS = contract.budgetBands;
export const SERVICE_ADVISOR_NEED_OPTIONS = contract.serviceNeeds;
export const SERVICE_ADVISOR_PRIORITY_OPTIONS = contract.priorities;

export const serviceAdvisorLabel = (options, value) => options.find(option => option.value === value)?.label || value;
