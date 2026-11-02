import { SCHEMA_VERSION } from './db'
import { makeBeat, makeChapter, makeCharacter, makeRelationship, makeStory, makeTrait } from './factories'
import type { Beat, TrellisBackup } from './types'

/**
 * Example content so the app isn't empty on first load. Pure function — also
 * used by tests as a realistic fixture.
 *
 * Fixed ids keep the fixture deterministic across runs.
 */
export function buildSeed(): TrellisBackup {
  const now = Date.now()

  const mara = makeCharacter({
    id: 'c_mara',
    name: 'Mara Ellison',
    aka: 'Mar (Theo only)',
    pronouns: 'she/her',
    age: '34',
    color: '#9b4d5f',
    tagline: 'An architect who plans everything except what she wants — and is starting to resent the blueprint.',
    tags: ['lead', 'POV'],
    appearance: [
      makeTrait({ label: 'Build', value: 'Tall, long-limbed, a runner\'s leanness she\'s let soften a little', essential: true }),
      makeTrait({ label: 'Face', value: 'Sharp cheekbones, grey-green eyes, a small scar through her left eyebrow', essential: true }),
      makeTrait({ label: 'Hair', value: 'Dark, heavy, usually twisted up with a pencil through it', essential: true }),
      makeTrait({ label: 'Hands', value: 'Ink-stained fingertips; bites the skin beside her thumbnail when anxious' }),
      makeTrait({ label: 'Style', value: 'Linen, black, expensive and plain. Takes her rings off when she\'s thinking.' }),
    ],
    personality:
      'Precise, dry, quietly funny. Generous with others and stingy with herself. Treats wanting things as a design problem to be solved later. Under the control is someone who used to be reckless and misses it.',
    voice:
      'Short declaratives. Deflects with understatement. Swears rarely and well. Asks questions instead of answering them. When she is moved her sentences get shorter, not longer.',
    sampleLines: [
      'I didn\'t say I was unhappy. I said the house was quiet.',
      'Don\'t be kind to me right now, I\'ll fall apart.',
      'Ask me again. Properly this time.',
    ],
    motivations:
      'To find out whether the marriage is worth saving before she has to admit she has already half-left it. To be seen as someone other than the competent one.',
    desires:
      'Being slowed down. Being looked at for a long time. Losing the ability to narrate in her own head. Theo\'s hands, specifically — she has never told him that.',
    boundaries:
      'Hard: nothing non-consensual, no humiliation. Soft: she freezes if rushed; needs to be asked rather than told. Pain is not interesting to her; intensity is.',
    backstory:
      'Grew up in a cramped flat above her mother\'s dry cleaners; built a career out of making space. Met Theo at 25. Lost a pregnancy at 31 and neither of them has said the word since.',
    notes: 'Arc: from controlling the frame to stepping into it. Her scar is from a bike crash with June at 19 — pay this off in ch. 3.',
  })

  const theo = makeCharacter({
    id: 'c_theo',
    name: 'Theo Okafor',
    pronouns: 'he/him',
    age: '36',
    color: '#4f6f8f',
    tagline: 'A session cellist who listens for a living and has stopped listening at home.',
    tags: ['lead', 'POV'],
    appearance: [
      makeTrait({ label: 'Build', value: 'Broad through the shoulders, heavier than he was, moves carefully like the room might be fragile', essential: true }),
      makeTrait({ label: 'Face', value: 'Warm brown skin, close beard going grey at the chin, heavy-lidded dark eyes', essential: true }),
      makeTrait({ label: 'Hands', value: 'Large, calloused left fingertips; very still when he is paying attention', essential: true }),
      makeTrait({ label: 'Style', value: 'Old wool jumpers, worn-soft jeans, the same watch for ten years' }),
    ],
    personality:
      'Patient to a fault, conflict-avoidant, observant. Shows love through acts rather than words. Has a temper he is afraid of and so has sanded himself down into someone easy.',
    voice:
      'Unhurried. Long pauses he doesn\'t apologise for. Uses musical metaphors without noticing. Says "hey" softly as a whole sentence. Laughs before he answers when he\'s nervous.',
    sampleLines: ['Hey. Hey. Look at me.', 'You don\'t have to fill the silence. I like it.', 'Tell me what you want and I\'ll do it slowly.'],
    motivations: 'To get his wife back — not the marriage, her. To stop being the safe option.',
    desires:
      'Taking his time. Being trusted to lead. Hearing her lose her composure. He is more possessive than he lets himself be, and ashamed of it.',
    boundaries: 'Hard: nothing non-consensual. Needs explicit words, not just body language, before escalating — it matters to him.',
    backstory: 'Raised by his grandmother in Leeds; music scholarship at 14. Touring took him away for most of the year Mara needed him most.',
    notes: 'His possessiveness should read as tender, never controlling. He has not touched the cello in four months.',
  })

  const june = makeCharacter({
    id: 'c_june',
    name: 'Juniper Hale',
    aka: 'June',
    pronouns: 'she/her',
    age: '35',
    color: '#5f7f5a',
    tagline: 'The one who got away, now running the boatyard next door — unbothered, and very much bothering.',
    tags: ['supporting', 'catalyst'],
    appearance: [
      makeTrait({ label: 'Build', value: 'Compact, strong, sun-weathered', essential: true }),
      makeTrait({ label: 'Face', value: 'Freckled, crooked grin, pale blue eyes that hold a look too long', essential: true }),
      makeTrait({ label: 'Hair', value: 'Bleached short crop, salt-stiff' }),
    ],
    personality: 'Direct, warm, a little feral. Says the true thing first and deals with the fallout later. Not a villain; a mirror.',
    voice: 'Teasing, fast, regional. Calls everyone "love". Will answer a question with a dare.',
    sampleLines: ['You still do that thing with your rings, Ellison.', 'I\'m not here to break anything. You lot did that yourselves.'],
    motivations: 'Curiosity, mostly. And to know if Mara ever regretted leaving.',
    desires: 'Honesty, heat, people who know what they want. Not interested in being anyone\'s secret.',
    boundaries: 'Will not come between them unless invited by both. Hates being lied to.',
    backstory: 'Mara\'s first love at university. They crashed a bike together at 19; June still has the bike.',
    notes: 'Keep her ambiguous — threat, temptation, or the push they need? Possibly all three.',
  })

  const couple = makeRelationship(mara.id, theo.id, {
    id: 'r_mara_theo',
    label: 'Married nine years, drifting',
    dynamic:
      'Deep, wordless familiarity gone stale. They are kind to each other in a way that has become a wall. In bed she used to lead and he used to wait; neither remembers agreeing to that.',
    history: 'Met at a friend\'s wedding where he played and she heckled. The lost pregnancy three years ago is the fault line nobody names.',
    tension: 'She has booked the weekend to decide whether to leave. He suspects. Both want to be the one who reaches first and neither will.',
    consent:
      'Theo asks; Mara answers with action rather than words, which he has to learn to accept or ask past. A whispered "yes?" / "yes." is their rhythm. Either can stop anything with "pause" and it is honoured instantly.',
  })

  const past = makeRelationship(mara.id, june.id, {
    id: 'r_mara_june',
    label: 'First love, sixteen years apart',
    dynamic: 'Easy, sparring, charged. June knows the reckless Mara; Mara hates and loves being reminded.',
    history: 'Together two years at university. Mara left for London and a "sensible" life without a real goodbye.',
    tension: 'Unfinished. Neither is sure if it\'s desire or nostalgia.',
    consent: 'June will flirt freely but will not act unless Mara is unambiguous — and sober.',
  })

  const story = makeStory({
    id: 's_long_weekend',
    title: 'The Long Weekend',
    logline: 'A married couple rents a coastal cottage to decide whether to end things — and finds the woman next door is the one Mara never got over.',
    premise:
      'Mara books four days in a stone cottage in Northumberland as a last attempt, or a clean ending. Theo comes because he is afraid of what happens if he doesn\'t. Next door, June runs a boatyard and remembers everything. Over one long weekend the three of them say what nine years of marriage have kept quiet.',
    genre: 'Literary romance, adult',
    heat: 'Slow burn → explicit. Intimacy is earned and emotionally specific; never gratuitous.',
    pov: 'Close third, alternating by chapter',
    tense: 'past',
    style:
      'Restrained, sensory, interior. Short paragraphs. Let silence and small physical details carry the weight. Dialogue sparse and subtext-heavy. British English spelling. Avoid purple prose, clichés like "electricity shot through her", and therapy-speak.',
    contentRules:
      'Always: enthusiastic consent on the page, even if wordless. Adults only. Never: non-consent, cheating presented as consequence-free.',
    world: 'A wind-scoured village on the Northumberland coast in late October. Stone cottage with a wood-burner and bad Wi-Fi. Low tide exposes a causeway to the island twice a day.',
    status: 'outlining',
    tags: ['romance', 'marriage', 'slow burn'],
    cast: [
      { characterId: mara.id, role: 'Protagonist', storyNotes: 'She has a half-written email to a divorce lawyer saved in her drafts.' },
      { characterId: theo.id, role: 'Protagonist', storyNotes: 'He has found the email. He has not said so.' },
      { characterId: june.id, role: 'Catalyst', storyNotes: '' },
    ],
    createdAt: now,
    updatedAt: now,
  })

  const ch1 = makeChapter(story.id, 0, {
    id: 'ch_1',
    title: 'Arrival',
    purpose: 'Establish the distance between them, the setting, and plant June.',
    summary: 'They arrive at the cottage in the rain, perform politeness, and Mara sees June at the boatyard and doesn\'t tell Theo.',
    povCharacterId: mara.id,
    characterIds: [mara.id, theo.id],
    setting: 'The drive north; the cottage; the boatyard at dusk',
  })
  const ch2 = makeChapter(story.id, 1, {
    id: 'ch_2',
    title: 'Low Tide',
    purpose: 'Crack the politeness. First real touch in months. Introduce June properly.',
    summary: '',
    povCharacterId: theo.id,
    characterIds: [mara.id, theo.id, june.id],
    setting: 'The causeway at low tide; the cottage at night',
  })
  const ch3 = makeChapter(story.id, 2, {
    id: 'ch_3',
    title: 'The Bike',
    purpose: 'Mara confronts her past with June and chooses — for the first time in years — out loud.',
    povCharacterId: mara.id,
    characterIds: [mara.id, june.id],
    setting: 'June\'s workshop',
  })

  const b = (chapterId: string, order: number, p: Partial<Beat>) => makeBeat(story.id, chapterId, order, { id: `b_${chapterId}_${order}`, ...p })

  const beats: Beat[] = [
    b(ch1.id, 0, {
      title: 'The drive',
      description: 'Five hours north with the radio filling the silence. Theo offers to drive the last stretch; Mara refuses, then regrets it.',
      emotion: 'Mara: brittle control. Theo: careful, watching her hands on the wheel.',
      tone: 'Quiet, observational',
      status: 'written',
      recap: 'Long drive north. Mara refused to let Theo drive; they talked only about the satnav. She took her rings off at a petrol station and didn\'t put them back on.',
    }),
    b(ch1.id, 1, {
      title: 'The cottage',
      description: 'Rain, a stuck door, one bed. Both offer to take the sofa. Neither does. They lie awake not touching.',
      emotion: 'Mara: humiliatingly aware of his body. Theo: hopeful, hiding it.',
      tone: 'Tender, awkward, faintly comic',
      mustInclude: 'The rings on the bedside table — Theo notices.',
      status: 'written',
      recap: 'They share the only bed without touching. Theo saw her rings on the nightstand and said nothing. Both lay awake past two.',
    }),
    b(ch1.id, 2, {
      title: 'The boatyard',
      description: 'Mara walks at dawn and sees June hauling a dinghy. June recognises her first. A short, electric exchange; June invites them both for a drink "if he\'s the sharing type".',
      emotion: 'Mara: vertigo, nineteen again. Shame at how good it feels.',
      tone: 'Bright, wind-blown, unsettling',
      pacing: 'Brisk dialogue, slow final image',
      mustAvoid: 'Any physical contact between Mara and June.',
      characterIds: [mara.id, june.id],
      targetWords: 900,
      status: 'ready',
    }),
    b(ch2.id, 0, {
      title: 'The causeway',
      description: 'Theo and Mara walk out to the island at low tide. He tells her he found the email. She doesn\'t deny it.',
      emotion: 'Theo: steady on the surface, terrified underneath. Mara: relief that it\'s out.',
      tone: 'Raw, exposed, the sea as pressure',
      pacing: 'Slow. Let the pauses breathe.',
      mustInclude: 'The tide clock — they have two hours before it cuts them off.',
      characterIds: [mara.id, theo.id],
      targetWords: 1200,
      status: 'planned',
    }),
    b(ch2.id, 1, {
      title: 'Stranded',
      description: 'They misjudge the tide and have to wait out the night in the old lifeboat shelter. Cold, honest, and finally touching.',
      emotion: 'Theo: wanting to be asked. Mara: wanting to stop deciding.',
      tone: 'Intimate, slow-burning, charged with grief and want',
      pacing: 'Build slowly; the first kiss is a turning point, not a climax',
      mustInclude: 'Explicit verbal consent before anything escalates — "yes?" / "yes."',
      mustAvoid: 'Rushing. No skipping the conversation to get to the sex.',
      characterIds: [mara.id, theo.id],
      targetWords: 2000,
      status: 'planned',
    }),
    b(ch2.id, 2, {
      title: 'June\'s lights',
      description: 'Walking back at dawn, they see June\'s workshop lit. Theo asks who she is. Mara tells him the truth.',
      characterIds: [mara.id, theo.id],
      status: 'idea',
    }),
    b(ch3.id, 0, {
      title: 'The workshop',
      description: 'Mara goes to June alone, ostensibly to return a borrowed coat. June shows her the bike.',
      status: 'idea',
    }),
  ]

  return {
    app: 'trellis',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    characters: [mara, theo, june],
    relationships: [couple, past],
    stories: [story],
    chapters: [ch1, ch2, ch3],
    beats,
  }
}
