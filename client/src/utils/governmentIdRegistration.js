export const isGovernmentIdConfirmed = (review, selectedType) => ['matched', 'manual'].includes(review?.status)
  && review.selectedType === selectedType;
