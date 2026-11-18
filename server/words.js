// Everyday, medium-difficulty words grouped by category. Each game deals unique words,
// so the total must stay >= MAX_PLAYERS.
export const WORD_CATEGORIES = {
  food: [
    'pancake', 'avocado', 'cinnamon', 'popcorn', 'lasagna', 'pretzel', 'omelette', 'pineapple',
    'broccoli', 'mushroom', 'cupcake', 'burrito', 'croissant', 'meatball', 'coconut', 'blueberry',
    'watermelon', 'sandwich', 'spaghetti', 'pickle', 'peanut', 'honey', 'yogurt', 'waffle',
    'noodle', 'dumpling', 'cucumber', 'strawberry', 'lemonade', 'milkshake', 'cheesecake', 'sausage',
    'ketchup', 'mustard', 'cereal', 'toast', 'salmon', 'garlic', 'pumpkin', 'marshmallow',
  ],
  home: [
    'toothbrush', 'pillow', 'blanket', 'umbrella', 'candle', 'mirror', 'ladder', 'bucket',
    'scissors', 'stapler', 'calendar', 'doorbell', 'curtain', 'lampshade', 'kettle', 'toaster',
    'blender', 'microwave', 'fridge', 'sofa', 'mattress', 'hammer', 'flashlight', 'battery',
    'charger', 'remote', 'keyboard', 'headphones', 'wallet', 'backpack', 'suitcase', 'envelope',
    'notebook', 'pencil', 'eraser', 'magnet', 'sponge', 'towel', 'hanger', 'alarm',
  ],
  animals: [
    'elephant', 'giraffe', 'penguin', 'kangaroo', 'dolphin', 'octopus', 'butterfly', 'squirrel',
    'hedgehog', 'crocodile', 'flamingo', 'peacock', 'raccoon', 'turtle', 'rabbit', 'hamster',
    'parrot', 'camel', 'zebra', 'gorilla', 'cheetah', 'koala', 'panda', 'jellyfish',
    'lobster', 'spider', 'mosquito', 'ladybug', 'owl', 'eagle', 'shark', 'whale',
    'donkey', 'goat', 'chicken', 'duck', 'frog', 'snail', 'bee', 'horse',
  ],
  places: [
    'airport', 'library', 'hospital', 'bakery', 'museum', 'stadium', 'beach', 'castle',
    'island', 'jungle', 'desert', 'volcano', 'bridge', 'tunnel', 'garage', 'kitchen',
    'bathroom', 'balcony', 'basement', 'elevator', 'supermarket', 'pharmacy', 'cinema', 'theater',
    'restaurant', 'school', 'office', 'factory', 'farm', 'zoo', 'playground', 'parking',
    'harbor', 'lighthouse', 'campsite', 'prison', 'church', 'hotel', 'gym', 'market',
  ],
  people: [
    'doctor', 'teacher', 'pilot', 'chef', 'farmer', 'dentist', 'firefighter', 'police',
    'lawyer', 'nurse', 'plumber', 'waiter', 'baker', 'astronaut', 'pirate', 'wizard',
    'ninja', 'princess', 'superhero', 'clown', 'magician', 'detective', 'soldier', 'sailor',
    'cowboy', 'vampire', 'zombie', 'robot', 'alien', 'mermaid', 'dragon', 'king',
    'queen', 'baby', 'grandma', 'neighbor', 'tourist', 'referee', 'singer', 'dancer',
  ],
  nature: [
    'rainbow', 'thunder', 'lightning', 'snowflake', 'sunshine', 'tornado', 'earthquake', 'waterfall',
    'mountain', 'river', 'ocean', 'forest', 'flower', 'cactus', 'sunflower', 'rose',
    'tree', 'grass', 'cloud', 'rain', 'storm', 'moon', 'star', 'planet',
    'comet', 'sunset', 'sunrise', 'puddle', 'wave', 'sand', 'rock', 'fire',
    'ice', 'wind', 'fog', 'autumn', 'winter', 'summer', 'spring', 'garden',
  ],
  activities: [
    'swimming', 'dancing', 'singing', 'cooking', 'painting', 'jogging', 'sleeping', 'camping',
    'fishing', 'shopping', 'skiing', 'surfing', 'cycling', 'juggling', 'knitting', 'gardening',
    'hiking', 'yoga', 'karaoke', 'bowling', 'tennis', 'football', 'basketball', 'chess',
    'puzzle', 'selfie', 'birthday', 'wedding', 'holiday', 'picnic', 'barbecue', 'party',
    'vacation', 'homework', 'exam', 'meeting', 'concert', 'movie', 'podcast', 'marathon',
  ],
  gadgets: [
    'bicycle', 'motorcycle', 'helicopter', 'submarine', 'rocket', 'tractor', 'ambulance', 'taxi',
    'train', 'airplane', 'scooter', 'skateboard', 'sailboat', 'canoe', 'bus', 'truck',
    'traffic', 'passport', 'ticket', 'map', 'compass', 'telescope', 'camera', 'computer',
    'laptop', 'smartphone', 'television', 'radio', 'internet', 'password', 'email', 'printer',
    'speaker', 'microphone', 'drone', 'satellite', 'engine', 'tire', 'seatbelt', 'helmet',
  ],
  stuff: [
    'sunglasses', 'sneakers', 'pajamas', 'sweater', 'scarf', 'gloves', 'socks', 'necklace',
    'bracelet', 'earring', 'crown', 'hat', 'jacket', 'raincoat', 'bikini', 'tie',
    'belt', 'boots', 'slippers', 'uniform', 'costume', 'mask', 'diamond', 'treasure',
    'money', 'coin', 'gift', 'balloon', 'kite', 'puppet', 'teddy', 'guitar',
    'piano', 'drum', 'violin', 'trumpet', 'trophy', 'medal', 'ghost', 'monster',
  ],
};

export const ALL_WORDS = Object.values(WORD_CATEGORIES).flat();
