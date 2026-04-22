// Lightweight client-side mood detection from message text (works for both
// AI replies and user input). Returns one of MoodName based on keyword,
// emoji, and punctuation cues.

export type MoodName =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'sympathetic'
  | 'bored'
  | 'curious'
  | 'thinking'
  | 'angry'
  | 'laughing'
  | 'surprised'
  | 'embarrassed'
  | 'disgusted';

const RULES: { mood: MoodName; weight: number; patterns: RegExp[] }[] = [
  {
    mood: 'excited',
    weight: 1.2,
    patterns: [
      /\b(wow|wah|hebat|keren|amazing|luar biasa|yay|asik|asyik|mantap|wahoo|woohoo|yes+|yeay)\b/i,
      /(🎉|🥳|🤩|🔥|✨|🎊|💯)/,
      /!{2,}/,
    ],
  },
  {
    mood: 'laughing',
    weight: 1.3,
    patterns: [
      /\b(haha|hehe|hihi|lol|wkwk+|lucu|ngakak|ketawa|tertawa|geli|kocak)\b/i,
      /(😂|🤣|😆|😹)/,
    ],
  },
  {
    mood: 'surprised',
    weight: 1.1,
    patterns: [
      /\b(eh|hah|heh|serius|beneran|masa|kok bisa|tidak mungkin|really|seriously|omg|astaga|ya ampun)\b/i,
      /(😲|😮|🤯|😱|😳)/,
    ],
  },
  {
    mood: 'embarrassed',
    weight: 1.0,
    patterns: [
      /\b(malu|canggung|awkward|maaf banget|sori|ups|aduh|duh|salah aku|blush)\b/i,
      /(😳|🫣|😅|🙈)/,
    ],
  },
  {
    mood: 'disgusted',
    weight: 1.0,
    patterns: [
      /\b(jijik|eww|yuck|menjijikkan|kotor|bau|najis|ugh)\b/i,
      /(🤢|🤮|😖|😣)/,
    ],
  },
  {
    mood: 'happy',
    weight: 1.0,
    patterns: [
      /\b(senang|bahagia|happy|tentu|baik|bagus|sip|oke|good|great|nice|alhamdulillah)\b/i,
      /(😀|😃|😄|😁|😊|🙂|😉|😺|😸|❤️|💖|👍)/,
    ],
  },
  {
    mood: 'sympathetic',
    weight: 1.4,
    patterns: [
      /\b(meninggal|wafat|kehilangan|ditinggal|berduka|berpulang)\b/i,
      /\b(sakit|sakit parah|opname|rumah sakit|kanker|tumor|operasi)\b/i,
      /\b(putus|cerai|diselingkuhi|patah hati|broken)\b/i,
      /\b(gagal|ditolak|dipecat|kena phk|bangkrut)\b/i,
      /\b(kesepian|sendirian|capek|lelah banget|menyerah|give up)\b/i,
      /\b(maaf|sorry|sayang sekali|turut prihatin|turut berduka|semoga|kasihan|mengerti perasaan|aku paham|aku mengerti|peluk)\b/i,
      /(🥺|🤗|💞|💕|🥲)/,
    ],
  },
  {
    mood: 'sad',
    weight: 1.1,
    patterns: [
      /\b(sedih|sayang|kecewa|menyesal|sad|hiks|huhu|tragis|menyedihkan|nangis|menangis)\b/i,
      /(😢|😭|😞|😔|😟|☹️|💔)/,
    ],
  },
  {
    mood: 'curious',
    weight: 0.9,
    patterns: [
      /\?\s*$/,
      /\b(menarik|interesting|kira-kira|apakah|bagaimana|gimana|kenapa|mengapa|wonder|hmm+)\b/i,
      /(🤔|❓|❔)/,
    ],
  },
  {
    mood: 'thinking',
    weight: 0.8,
    patterns: [
      /\b(hmm+|sebentar|tunggu|coba pikir|let me think|menurutku|mungkin|sepertinya)\b/i,
    ],
  },
  {
    mood: 'bored',
    weight: 0.7,
    patterns: [
      /\b(bosan|membosankan|biasa saja|so so|meh)\b/i,
      /(😐|😑|🥱)/,
    ],
  },
  {
    mood: 'angry',
    weight: 0.9,
    patterns: [
      /\b(marah|kesal|jengkel|sebal|annoying|menyebalkan|benci)\b/i,
      /(😠|😡|🤬)/,
    ],
  },
];

export function detectMood(text: string): MoodName {
  if (!text || !text.trim()) return 'neutral';

  const scores: Record<string, number> = {};
  for (const rule of RULES) {
    let s = 0;
    for (const p of rule.patterns) {
      const matches = text.match(p);
      if (matches) s += matches.length * rule.weight;
    }
    if (s > 0) scores[rule.mood] = (scores[rule.mood] ?? 0) + s;
  }

  let best: MoodName = 'neutral';
  let bestScore = 0.5; // threshold to overcome neutral
  for (const [mood, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = mood as MoodName;
    }
  }
  return best;
}
