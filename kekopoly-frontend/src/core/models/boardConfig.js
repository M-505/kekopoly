/**
 * Default Kekopoly board configuration
 * This file defines all properties, spaces, and their attributes
 */

/**
 * Board spaces configuration
 * Maps position to space information
 */
export const boardSpaces = [
  { position: 0, name: 'PEPE (JAIL)', type: 'jail', propertyId: null }, // Position 0
  { position: 1, name: 'START', type: 'go', propertyId: null }, // Position 1
  { position: 2, name: 'COLMER CORNER', type: 'property', propertyId: 'prop_colmer_corner' }, // Position 2
  { position: 3, name: 'RAGE TRAIN', type: 'property', propertyId: 'prop_rage_train' }, // Position 3 - Assuming property, could be railroad?
  { position: 4, name: 'WOJAK STREET', type: 'property', propertyId: 'prop_wojak_street' }, // Position 4
  { position: 5, name: 'FREE SPACE', type: 'free_parking', propertyId: null }, // Position 6
  { position: 6, name: 'COLLECT 200 KEKELS', type: 'tax', amount: 200, propertyId: null }, // Position 5 - Income Tax style
  { position: 7, name: 'STONK AVENUE', type: 'property', propertyId: 'prop_stonk_avenue' }, // Position 7
  { position: 8, name: 'KEKE AVENUE', type: 'property', propertyId: 'prop_keke_avenue' }, // Position 8
  { position: 9, name: 'STONKS AVENUE', type: 'property', propertyId: 'prop_stonks_avenue' }, // Position 9
  { position: 10, name: 'FREE SPACE', type: 'free_parking', propertyId: null }, // Position 10
  { position: 11, name: 'KEKOPOLY COLLECT 200 KEKELS', type: 'tax', amount: 200, propertyId: null }, // Position 11 - Assuming another tax/fee
  { position: 12, name: 'GALAXY BRAIN CENTER', type: 'property', propertyId: 'prop_galaxy_brain' }, // Position 12
  { position: 13, name: 'KEK SERVERS', type: 'property', propertyId: 'prop_kek_servers' }, // Position 13
  { position: 14, name: 'DOOMSCROLL AVENUE', type: 'property', propertyId: 'prop_doomscroll_1' }, // Position 14
  { position: 15, name: 'REDPILL CARD', type: 'chance', propertyId: null }, // Position 15
  { position: 16, name: 'COOMER CASINO', type: 'property', propertyId: 'prop_coomer_casino' }, // Position 16
  { position: 17, name: 'FREE SPACE', type: 'free_parking', propertyId: null }, // Position 17
  { position: 18, name: 'FREE SPACE', type: 'free_parking', propertyId: null }, // Position 18 - Note: Multiple Free Spaces
  { position: 19, name: 'PEPE TRAIN', type: 'property', propertyId: 'prop_pepe_train' }, // Position 19 - Assuming property, could be railroad?
  { position: 20, name: 'DOOMSCROLL AVENUE', type: 'property', propertyId: 'prop_doomscroll_2' }, // Position 20
  { position: 21, name: 'ORANGE SPACE', type: 'chance', propertyId: null }, // Position 21 - Assuming draws card
  { position: 22, name: 'CHAIR', type: 'special', effect: 'skip_turn', propertyId: null }, // Position 22 - Custom type
  { position: 23, name: 'GREEN SPACE', type: 'community_chest', propertyId: null }, // Position 23 - Assuming draws card
  { position: 24, name: 'MEME CARD', type: 'community_chest', propertyId: null }, // Position 24
  { position: 25, name: 'RARE PEPE PLAZA', type: 'property', propertyId: 'prop_rare_pepe_plaza' }, // Position 25
];

/**
 * Property definitions with prices, rents, and other attributes
 */
export const properties = {
  // Brown group
  prop_colmer_corner: {
    name: 'COLMER CORNER',
    group: 'brown', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 60, // ** PLACEHOLDER **
    rent: [2, 10, 30, 90, 160, 250], // ** PLACEHOLDER Rents **
    houseCost: 50, // ** PLACEHOLDER **
    mortgage: 30, // ** PLACEHOLDER **
  },
  prop_wojak_street: {
    name: 'WOJAK STREET',
    group: 'brown', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 60, // ** PLACEHOLDER **
    rent: [4, 20, 60, 180, 320, 450], // ** PLACEHOLDER Rents **
    houseCost: 50, // ** PLACEHOLDER **
    mortgage: 30, // ** PLACEHOLDER **
  },

  // Light blue group
  prop_stonk_avenue: {
    name: 'STONK AVENUE',
    group: 'lightblue', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 100, // ** PLACEHOLDER **
    rent: [6, 30, 90, 270, 400, 550], // ** PLACEHOLDER Rents **
    houseCost: 50, // ** PLACEHOLDER **
    mortgage: 50, // ** PLACEHOLDER **
  },
  prop_keke_avenue: {
    name: 'KEKE AVENUE',
    group: 'lightblue', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 100, // ** PLACEHOLDER **
    rent: [6, 30, 90, 270, 400, 550], // ** PLACEHOLDER Rents **
    houseCost: 50, // ** PLACEHOLDER **
    mortgage: 50, // ** PLACEHOLDER **
  },
  prop_stonks_avenue: {
    name: 'STONKS AVENUE',
    group: 'lightblue', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 120, // ** PLACEHOLDER **
    rent: [8, 40, 100, 300, 450, 600], // ** PLACEHOLDER Rents **
    houseCost: 50, // ** PLACEHOLDER **
    mortgage: 60, // ** PLACEHOLDER **
  },

  // Pink group
  prop_rare_pepe_plaza: {
    name: 'RARE PEPE PLAZA',
    group: 'pink', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 140, // ** PLACEHOLDER **
    rent: [10, 50, 150, 450, 625, 750], // ** PLACEHOLDER Rents **
    houseCost: 100, // ** PLACEHOLDER **
    mortgage: 70, // ** PLACEHOLDER **
  },

  // Orange group
  prop_coomer_casino: {
    name: 'COOMER CASINO',
    group: 'orange', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 180, // ** PLACEHOLDER **
    rent: [14, 70, 200, 550, 750, 950], // ** PLACEHOLDER Rents **
    houseCost: 100, // ** PLACEHOLDER **
    mortgage: 90, // ** PLACEHOLDER **
  },

  // Red group
  prop_doomscroll_1: {
    name: 'DOOMSCROLL AVENUE',
    group: 'red', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 220, // ** PLACEHOLDER **
    rent: [18, 90, 250, 700, 875, 1050], // ** PLACEHOLDER Rents **
    houseCost: 150, // ** PLACEHOLDER **
    mortgage: 110, // ** PLACEHOLDER **
  },
  prop_doomscroll_2: {
    name: 'DOOMSCROLL AVENUE',
    group: 'red', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 220, // ** PLACEHOLDER **
    rent: [18, 90, 250, 700, 875, 1050], // ** PLACEHOLDER Rents **
    houseCost: 150, // ** PLACEHOLDER **
    mortgage: 110, // ** PLACEHOLDER **
  },

  // Green group
  prop_galaxy_brain: {
    name: 'GALAXY BRAIN CENTER',
    group: 'green', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 300, // ** PLACEHOLDER **
    rent: [26, 130, 390, 900, 1100, 1275], // ** PLACEHOLDER Rents **
    houseCost: 200, // ** PLACEHOLDER **
    mortgage: 150, // ** PLACEHOLDER **
  },
  prop_kek_servers: {
    name: 'KEK SERVERS',
    group: 'green', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 320, // ** PLACEHOLDER **
    rent: [28, 150, 450, 1000, 1200, 1400], // ** PLACEHOLDER Rents **
    houseCost: 200, // ** PLACEHOLDER **
    mortgage: 160, // ** PLACEHOLDER **
  },

  // Transit properties
  prop_rage_train: {
    name: 'RAGE TRAIN',
    group: 'railroad', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 200, // ** PLACEHOLDER **
    rent: [25, 50, 100, 200], // ** PLACEHOLDER Rents (based on # owned) **
    houseCost: null,
    mortgage: 100, // ** PLACEHOLDER **
  },
  prop_pepe_train: {
    name: 'PEPE TRAIN',
    group: 'railroad', // ** GUESS - PLEASE CONFIRM/CHANGE **
    cost: 200, // ** PLACEHOLDER **
    rent: [25, 50, 100, 200], // ** PLACEHOLDER Rents (based on # owned) **
    houseCost: null,
    mortgage: 100, // ** PLACEHOLDER **
  },

  // Utility properties
  // prop_utility_1: {
  //   name: 'Utility 1',
  //   group: 'utility',
  //   cost: 150,
  //   rent: [4, 10], // Rent based on dice roll * multiplier
  //   houseCost: null,
  //   mortgage: 75,
  // },
};

/**
 * Get full board configuration
 * @returns {Object} Complete board configuration
 */
export const getBoardConfig = () => {
  return {
    boardSpaces,
    properties
  };
};

export default getBoardConfig;