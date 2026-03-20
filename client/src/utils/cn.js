export function cn(...inputs) {
  try {
    const classes = inputs
      .filter(Boolean)
      .map(input => {
        if (typeof input === 'string') return input;
        if (typeof input === 'object' && input !== null) {
          return Object.keys(input).filter(key => input[key]).join(' ');
        }
        return '';
      })
      .join(' ')
      .trim();
    return classes || '';
  } catch (error) {
    console.warn('cn utility error:', error);
    return '';
  }
}
