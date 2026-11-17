export const constituencies = [
  'Aldona', 'Benaulim', 'Bicholim', 'Calangute', 'Canacona', 'Cortalim',
  'Cumbarjua', 'Cuncolim', 'Curchorem', 'Curtorim', 'Dabolim', 'Fatorda',
  'Maem', 'Mandrem', 'Mapusa', 'Marcaim', 'Margao', 'Mormugao', 'Navelim',
  'Nuvem', 'Panaji', 'Pernem', 'Ponda', 'Poriem', 'Porvorim', 'Priol',
  'Quepem', 'Saligao', 'Sanguem', 'Sankhali', 'Santa Cruz', 'Sanvordem',
  'Shiroda', 'Siolim', 'St. Andre', 'Taleigao', 'Thivim', 'Valpoi', 'Vasco', 'Velim'
];

export const events = {
  marathon: { name: 'Marathon', category: 'Sports', min: 1, max: 1 },
  cricket: { name: "Cricket (Men)", category: 'Sports', gender: 'Male', min: 11, max: 15 },
  'football-men': { name: "Football (Men)", category: 'Sports', rules: 'football', gender: 'Male', min: 11, max: 16 },
  'football-women': { name: "Football (Women)", category: 'Sports', rules: 'football', gender: 'Female', min: 11, max: 16 },
  volleyball: { name: "Volleyball (Men)", category: 'Sports', gender: 'Male', min: 6, max: 12 },
  badminton: { name: 'Badminton - Singles', category: 'Sports', min: 1, max: 1 },
  carrom: { name: 'Carrom - Singles', category: 'Sports', min: 1, max: 1 },
  'group-dance': { name: 'Group Dance', category: 'Cultural', min: 6, max: 10 },
  fugdi: { name: 'Fugdi', category: 'Cultural', min: 10, max: 14 },
  'ghumat-aarti-men': { name: "Ghumat Aarti (Men)", category: 'Cultural', rules: 'ghumat-aarti', gender: 'Male', min: 8, max: 12 },
  'ghumat-aarti-women': { name: "Ghumat Aarti (Women)", category: 'Cultural', rules: 'ghumat-aarti', gender: 'Female', min: 8, max: 12 },
  'street-play': { name: 'Street Play (Inter-collegiate)', category: 'Cultural', min: 8, max: 15 },
  'solo-singing': { name: 'Solo Singing', category: 'Cultural', min: 1, max: 1 },
  rangoli: { name: 'Rangoli', category: 'Cultural', min: 1, max: 2, teamNameRequired: false },
  painting: { name: 'Painting', category: 'Cultural', min: 1, max: 1 }
};

export const marathonDistances = ['5 KM Run', '10 KM Run', '21 KM Half Marathon'];
export const rangoliCategories = ['Traditional - Sanskar Bharti', 'Creative (Portrait)'];
export const requiresTeamName = (event) => event.max > 1 && event.teamNameRequired !== false;
export const genders = ['Male', 'Female', 'Other'];
export const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
export const tshirtSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
