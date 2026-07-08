// Master list for "what I claim to play" — intentionally broad, since The Rec
// covers everything from serious rec leagues to "we do this every Tuesday"
// hobbies. Searchable + multi-select in the UI rather than a fixed picker.

export type SportTag = string;

export type SportOption = {
  value: SportTag;
  label: string;
  emoji: string;
};

function toValue(label: string): SportTag {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SPORT_ENTRIES: Array<[string, string]> = [
  // Ball sports / team sports
  ['Basketball', '🏀'],
  ['3v3 Basketball', '🏀'],
  ['Softball', '🥎'],
  ['Baseball', '⚾'],
  ['Soccer', '⚽'],
  ['Futsal', '⚽'],
  ['Flag Football', '🏈'],
  ['Touch Football', '🏈'],
  ['Football', '🏈'],
  ['Volleyball', '🏐'],
  ['Beach Volleyball', '🏐'],
  ['Sand Volleyball', '🏐'],
  ['Kickball', '⚽'],
  ['Dodgeball', '🔴'],
  ['Ultimate Frisbee', '🥏'],
  ['Handball', '🤾'],
  ['Rugby', '🏉'],
  ['Lacrosse', '🥍'],
  ['Field Hockey', '🏑'],
  ['Ice Hockey', '🏒'],
  ['Roller Hockey', '🏒'],
  ['Cricket', '🏏'],
  ['Netball', '🏐'],
  ['Water Polo', '🤽'],
  ['Wiffle Ball', '⚾'],
  ['Kan Jam', '🥏'],
  ['Spikeball', '🏐'],
  ['Four Square', '🟨'],

  // Racket / paddle sports
  ['Pickleball', '🏓'],
  ['Tennis', '🎾'],
  ['Table Tennis', '🏓'],
  ['Badminton', '🏸'],
  ['Padel', '🎾'],
  ['Squash', '🎾'],
  ['Racquetball', '🎾'],

  // Golf & precision
  ['Golf', '⛳'],
  ['Disc Golf', '🥏'],
  ['Mini Golf', '⛳'],
  ['Bowling', '🎳'],
  ['Darts', '🎯'],

  // Running / endurance
  ['Run Club', '🏃'],
  ['5K Running', '🏃'],
  ['Trail Running', '🏃'],
  ['Marathon Training', '🏃'],
  ['Track and Field', '🏃'],
  ['Cross Country', '🏃'],
  ['Race Walking', '🚶'],
  ['Triathlon', '🏊'],
  ['Duathlon', '🚴'],

  // Cycling
  ['Cycling', '🚴'],
  ['Road Biking', '🚴'],
  ['Mountain Biking', '🚵'],
  ['BMX', '🚲'],
  ['Spin Class', '🚴'],

  // Water sports
  ['Swimming', '🏊'],
  ['Open Water Swimming', '🏊'],
  ['Surfing', '🏄'],
  ['Paddleboarding', '🏄'],
  ['Kayaking', '🛶'],
  ['Canoeing', '🛶'],
  ['Rowing', '🚣'],
  ['Crew', '🚣'],
  ['Sailing', '⛵'],
  ['Water Skiing', '🎿'],
  ['Wakeboarding', '🏄'],
  ['Scuba Diving', '🤿'],
  ['Snorkeling', '🤿'],
  ['Fishing', '🎣'],

  // Combat / martial arts
  ['Boxing', '🥊'],
  ['Kickboxing', '🥊'],
  ['Muay Thai', '🥊'],
  ['Brazilian Jiu-Jitsu', '🥋'],
  ['Judo', '🥋'],
  ['Karate', '🥋'],
  ['Taekwondo', '🥋'],
  ['Wrestling', '🤼'],
  ['Fencing', '🤺'],
  ['MMA', '🥊'],

  // Winter sports
  ['Skiing', '⛷️'],
  ['Snowboarding', '🏂'],
  ['Cross-Country Skiing', '⛷️'],
  ['Ice Skating', '⛸️'],
  ['Figure Skating', '⛸️'],
  ['Curling', '🥌'],
  ['Sledding', '🛷'],

  // Fitness / gym
  ['Weightlifting', '🏋️'],
  ['Powerlifting', '🏋️'],
  ['CrossFit', '🏋️'],
  ['Bodybuilding', '💪'],
  ['Calisthenics', '🤸'],
  ['HIIT', '🔥'],
  ['Yoga', '🧘'],
  ['Pilates', '🧘'],
  ['Barre', '🩰'],
  ['Rock Climbing', '🧗'],
  ['Bouldering', '🧗'],
  ['Parkour', '🤸'],
  ['Gymnastics', '🤸'],
  ['Cheerleading', '📣'],
  ['Dance', '💃'],
  ['Zumba', '💃'],
  ['Martial Arts Fitness', '🥋'],

  // Outdoor / adventure
  ['Hiking', '🥾'],
  ['Skateboarding', '🛹'],
  ['Roller Skating', '🛼'],
  ['Rollerblading', '🛼'],
  ['Frisbee', '🥏'],
  ['Kite Flying', '🪁'],
  ['Slacklining', '🤸'],
  ['Geocaching', '🧭'],
  ['Orienteering', '🧭'],
  ['Paintball', '🎨'],
  ['Airsoft', '🎯'],
  ['Laser Tag', '💥'],

  // Motorsport / niche
  ['Go-Karting', '🏎️'],
  ['Motocross', '🏍️'],
  ['Skydiving', '🪂'],

  // Catch-all
  ['Other', '🏅'],
];

export const SPORTS: SportOption[] = SPORT_ENTRIES.map(([label, emoji]) => ({
  value: label === 'Other' ? 'other' : toValue(label),
  label,
  emoji,
}));
