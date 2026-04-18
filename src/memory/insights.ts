// Emergent preferences derived from Wonder Moments. Keeps deterministic
// summaries; no LLM pass at demo time.

import type { Topic } from '../cards';
import type { WonderMoment } from './profile';

export interface LearnedPreferences {
  totalMoments: number;
  topicFrequency: Record<Topic, number>;
  dominantTopic: Topic | null;
  recentConcepts: string[];   // short noun-ish tokens lifted from recent defensive answers
  repeatedQuestions: string[]; // rough signal that the kid keeps returning to something
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','being',
  'to','of','in','on','at','by','for','with','as','from','that','this','these',
  'those','it','its','there','their','they','them','you','your','we','our',
  'can','could','would','should','will','not','just','so','because','when',
  'like','also','still','then','more','some','many','most','always','every',
  'make','makes','made','get','gets','got','has','have','had','do','does',
  'did','one','two','three','up','out','into','over',
  'who','what','which','why','how','where','about','after','before','above',
  'below','down','without','while','during','until','again',
]);

export function computeInsights(history: WonderMoment[]): LearnedPreferences {
  const topicFrequency: Record<Topic, number> = {
    nature: 0, space: 0, body: 0, animals: 0, everyday: 0,
  };
  const wordFreq = new Map<string, number>();
  const questionCount = new Map<string, number>();

  for (const m of history) {
    topicFrequency[m.topic] = (topicFrequency[m.topic] ?? 0) + 1;

    const q = m.question.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (q) questionCount.set(q, (questionCount.get(q) ?? 0) + 1);

    for (const raw of m.defensive.split(/[\s,.!?;:()"'\u2014-]+/)) {
      const w = raw.toLowerCase();
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }
  }

  const dominantTopic =
    (Object.entries(topicFrequency) as [Topic, number][])
      .sort((a, b) => b[1] - a[1])
      .find(([, n]) => n > 0)?.[0] ?? null;

  const recentConcepts = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  const repeatedQuestions = [...questionCount.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([q]) => q);

  return {
    totalMoments: history.length,
    topicFrequency,
    dominantTopic,
    recentConcepts,
    repeatedQuestions,
  };
}
