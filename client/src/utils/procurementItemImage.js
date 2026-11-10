export const getProcurementItemImage = item => (
  item?.variant?.images?.[0]
  || item?.pet?.images?.[0]
  || item?.product?.images?.[0]
  || null
);
