const directionText = modifier => ({
  uturn: 'Make a U-turn',
  'sharp right': 'Turn sharply right',
  right: 'Turn right',
  'slight right': 'Bear right',
  straight: 'Continue straight',
  'slight left': 'Bear left',
  left: 'Turn left',
  'sharp left': 'Turn sharply left'
}[modifier] || 'Continue');

const roadSuffix = name => String(name || '').trim() ? ` onto ${String(name).trim()}` : '';

export const formatRouteInstruction = step => {
  const maneuver = step?.maneuver || {};
  const type = String(maneuver.type || '').toLowerCase();
  const modifier = String(maneuver.modifier || '').toLowerCase();
  const road = roadSuffix(step?.name);

  if (type === 'depart') return `${modifier ? directionText(modifier).replace('Turn', 'Head') : 'Head out'}${road}`;
  if (type === 'arrive') return 'Arrive at your destination';
  if (type.includes('roundabout') || type.includes('rotary')) {
    const exit = Number(maneuver.exit);
    return `Enter the roundabout${Number.isFinite(exit) && exit > 0 ? ` and take exit ${exit}` : ''}${road}`;
  }
  if (type === 'merge') return `Merge${modifier ? ` ${modifier}` : ''}${road}`;
  if (type === 'fork') return `Keep ${modifier || 'straight'}${road}`;
  if (type === 'on ramp' || type === 'ramp') return `Take the ${modifier ? `${modifier} ` : ''}ramp${road}`;
  if (type === 'off ramp') return `Take the ${modifier ? `${modifier} ` : ''}exit${road}`;
  if (type === 'end of road') return `${directionText(modifier)} at the end of the road${road}`;
  if (type === 'new name' || type === 'continue' || type === 'notification') return `Continue${road}`;
  return `${directionText(modifier)}${road}`;
};

export const formatRouteDistance = meters => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return 'Now';
  if (value < 1000) return `In ${Math.max(10, Math.round(value / 10) * 10)} m`;
  return `In ${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
};

export const parseOsrmRoute = payload => {
  const route = payload?.routes?.[0];
  if (payload?.code !== 'Ok' || !route?.geometry?.coordinates?.length || !route?.legs?.length) {
    throw new Error('No usable driving route was returned.');
  }

  const distanceMeters = Number(route.distance);
  const durationSeconds = Number(route.duration);
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
    throw new Error('The driving route did not include valid distance and duration data.');
  }

  const directions = route.legs.flatMap(leg => leg.steps || []).map((step, index) => ({
    id: `${index}-${step.maneuver?.location?.join(',') || step.name || 'step'}`,
    instruction: formatRouteInstruction(step),
    distanceMeters: Number(step.distance) || 0,
    distanceLabel: formatRouteDistance(step.distance),
    name: step.name || ''
  }));

  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [Number(lat), Number(lng)]),
    distanceMeters,
    distanceKm: distanceMeters / 1000,
    etaMinutes: durationSeconds <= 0 ? 0 : Math.max(1, Math.ceil(durationSeconds / 60)),
    directions
  };
};

export const distanceBetweenMeters = (first, second) => {
  const lat1 = Number(first?.lat);
  const lng1 = Number(first?.lng);
  const lat2 = Number(second?.lat);
  const lng2 = Number(second?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const radians = value => value * Math.PI / 180;
  const earthRadiusMeters = 6371000;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const calculateRouteProgress = (initialDistanceMeters, remainingDistanceMeters) => {
  const initial = Number(initialDistanceMeters);
  const remaining = Number(remainingDistanceMeters);
  if (!Number.isFinite(initial) || initial <= 0 || !Number.isFinite(remaining)) return 0;
  return Math.max(0, Math.min(100, Math.round(((initial - remaining) / initial) * 100)));
};
