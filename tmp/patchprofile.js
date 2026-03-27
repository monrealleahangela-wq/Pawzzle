const userId = 'USER_ID_HERE';
const update = { firstName: 'Updated', lastName: 'Name' };
console.log('PATCHing user', userId, 'with', update);
console.log('Sending PATCH request to /api/users/' + userId);
