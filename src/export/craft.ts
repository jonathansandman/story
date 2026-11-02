import { list, section, text, type PromptSection } from './document'

/**
 * Craft rules appended to every prose-writing prompt.
 *
 * They target the failure modes models fall into when given a dense
 * planning brief: echoing the brief's labels as prose, repeating the same
 * images every paragraph, monotone rhythm, "camera-only" narration with no
 * inner life, and padding a small beat to hit a word count.
 */
export const CRAFT_RULES = [
  'Everything above is private notes for you, not text for the reader. Never copy or paraphrase their wording, and never name a trait, rule or intention in the prose (no “she was honest”, “he stayed casual”, “connection first”). Show it through action, dialogue, gesture and detail.',
  'No repetition. Don’t reuse an image, phrase or descriptive word you’ve already used in this passage or the previous one. If you’ve described something once, the next mention must add something new — or leave it out.',
  'Every paragraph moves something: a new action, a new piece of information, a shift in feeling or power. If the beat is small, write fewer words rather than circling.',
  'Vary the rhythm. Mix long, flowing sentences with short ones; use fragments for impact, not as the default. Let some moments slow down and breathe.',
  'Give the point-of-view character an inner life: thoughts, memories, contradictions, what they notice that others wouldn’t, what they want and don’t say. They are a person in the scene, not a camera.',
  'Prefer specific, surprising detail over intensity. One precise sensory detail (sound, smell, texture, temperature, the room) beats three adjectives or superlatives. Avoid stock phrases and clichés.',
  'Dialogue carries subtext and each character’s own voice. People don’t narrate what is happening to each other or explain their feelings outright.',
  'End on a forward-leaning moment — a line of dialogue, an action, an image — never a summary or reflection on what just happened.',
]

/** Short version for follow-up prompts in the same chat. */
export const CRAFT_REMINDER = [
  'Same craft rules as before: don’t echo the notes, don’t reuse images or phrases from earlier passages, vary sentence rhythm, keep the narrator’s inner life present, and make every paragraph move something.',
]

export function craftSection(): PromptSection | null {
  return section('craft', 'Craft', [text('How to write it — these matter as much as what happens:'), list(CRAFT_RULES)])
}
