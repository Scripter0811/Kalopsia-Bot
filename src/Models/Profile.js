const createLocalModel = require('../Structures/LocalStore');

module.exports = createLocalModel('profiles.json', ['lastDaily', 'lastWeekly', 'lastMonthly']);
