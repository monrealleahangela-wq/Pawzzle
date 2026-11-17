import serviceAdvisorPetContract from '../constants/serviceAdvisorPetContract.json';

export const PET_TYPE_OPTIONS = serviceAdvisorPetContract.petTypes.map(({ label }) => ({
  label,
  value: label
}));

const BREEDS_BY_PET_TYPE = {
  dog: [
    'Beagle', 'Bulldog', 'Chihuahua', 'Dachshund', 'Dalmatian', 'French Bulldog',
    'German Shepherd', 'Golden Retriever', 'Labrador Retriever', 'Poodle', 'Pug',
    'Rottweiler', 'Shih Tzu', 'Siberian Husky', 'Yorkshire Terrier', 'Mixed Breed', 'Other'
  ],
  cat: [
    'Abyssinian', 'American Shorthair', 'Bengal', 'Birman', 'British Shorthair',
    'Burmese', 'Domestic Longhair', 'Domestic Shorthair', 'Maine Coon', 'Persian',
    'Ragdoll', 'Russian Blue', 'Siamese', 'Sphynx', 'Mixed Breed', 'Other'
  ],
  bird: [
    'African Grey', 'Budgerigar', 'Canary', 'Cockatiel', 'Cockatoo', 'Conure',
    'Finch', 'Lovebird', 'Macaw', 'Parrot', 'Other'
  ],
  rabbit: [
    'Dutch', 'Flemish Giant', 'Holland Lop', 'Lionhead', 'Mini Lop',
    'Netherland Dwarf', 'Rex', 'Mixed Breed', 'Other'
  ],
  hamster: [
    "Campbell's Dwarf", 'Chinese', 'Roborovski', 'Syrian', 'Winter White Dwarf',
    'Mixed Breed', 'Other'
  ],
  other: ['Mixed Breed', 'Other']
};

export const getBreedOptions = petType => (
  BREEDS_BY_PET_TYPE[String(petType || '').trim().toLowerCase()] || []
);
