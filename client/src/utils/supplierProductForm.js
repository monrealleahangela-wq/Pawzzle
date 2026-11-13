const parseNumericField = (value, {
  label,
  minimum = 0,
  integer = false,
  optional = false,
  greaterThanZero = false
}) => {
  const rawValue = typeof value === 'string' ? value.trim() : value;

  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return optional
      ? { value: undefined }
      : { error: `Enter ${label}.` };
  }

  const number = Number(rawValue);
  if (!Number.isFinite(number)) return { error: `Enter a valid ${label}.` };
  if (integer && !Number.isInteger(number)) {
    return { error: `${label} must be a whole number.` };
  }
  if (greaterThanZero && number <= 0) {
    return { error: `${label} must be greater than 0.` };
  }
  if (number < minimum) {
    return { error: `${label} must be ${minimum} or more.` };
  }

  return { value: number };
};

const assignNumber = (target, field, value, options) => {
  const result = parseNumericField(value, options);
  if (result.error) return result.error;
  if (result.value === undefined) delete target[field];
  else target[field] = result.value;
  return null;
};

export const prepareSupplierProductPayload = form => {
  const payload = {
    ...form,
    pet: form.pet ? { ...form.pet } : form.pet,
    variants: Array.isArray(form.variants)
      ? form.variants.map(variant => ({
        ...variant,
        attributes: Array.isArray(variant.attributes)
          ? variant.attributes.map(attribute => ({ ...attribute }))
          : []
      }))
      : []
  };

  let error = assignNumber(payload, 'deliveryLeadTimeDays', form.deliveryLeadTimeDays, {
    label: 'delivery lead time', minimum: 0, integer: true
  });
  if (error) return { error };

  if (form.productMode === 'variant') {
    for (let index = 0; index < payload.variants.length; index += 1) {
      const variant = payload.variants[index];
      const prefix = `Variant ${index + 1}`;

      error = assignNumber(variant, 'wholesalePrice', variant.wholesalePrice, {
        label: `${prefix} wholesale price`, minimum: 0
      });
      if (error) return { error };

      error = assignNumber(variant, 'availableStock', variant.availableStock, {
        label: `${prefix} supplier stock`, minimum: 0, integer: true
      });
      if (error) return { error };

      error = assignNumber(variant, 'minimumOrderQuantity', variant.minimumOrderQuantity, {
        label: `${prefix} minimum order quantity`, minimum: 1, integer: true
      });
      if (error) return { error };

      error = assignNumber(variant, 'weight', variant.weight, {
        label: `${prefix} weight`, optional: true, greaterThanZero: true
      });
      if (error) return { error };
    }

    return { payload, error: null };
  }

  error = assignNumber(payload, 'wholesalePrice', form.wholesalePrice, {
    label: 'the wholesale price', minimum: 0
  });
  if (error) return { error };

  error = assignNumber(payload, 'availableStock', form.itemType === 'live_pet' ? 1 : form.availableStock, {
    label: 'available stock', minimum: 0, integer: true
  });
  if (error) return { error };

  error = assignNumber(payload, 'minimumOrderQuantity', form.itemType === 'live_pet' ? 1 : form.minimumOrderQuantity, {
    label: 'minimum order quantity', minimum: 1, integer: true
  });
  if (error) return { error };

  if (form.itemType === 'live_pet') {
    error = assignNumber(payload.pet, 'age', form.pet?.age, {
      label: 'the pet age', minimum: 0
    });
    if (error) return { error };
  }

  return { payload, error: null };
};

export const supplierProductNumberInputValue = value => (
  value === null || value === undefined ? '' : value
);
