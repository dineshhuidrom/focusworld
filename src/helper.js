/* Focus World — "Ask Pip", a small helper bot. It is NOT an AI: it matches what people type to answers written
   here (study help, how Focus World works, a few real-life problems) and finds the maker's products by their tags,
   so products added later in My Shop are found without changing this file. Everything runs on the device;
   nothing anyone types is sent anywhere. */
(function (root) {
  'use strict';

  // Buttons the chat can show under an answer. app.js runs them.
  var ACTIONS = {
    'start-2': '🌱 Start 2 tiny minutes',
    'start-15': '▶ Start 15 minutes',
    'start-25': '▶ Start 25 minutes',
    'set-25-5': 'Set 25 + 5',
    'set-50-10': 'Set 50 + 10',
    'set-90-15': 'Set 90 + 15',
    'sounds': '🎧 Open Sounds',
    'settings': '⚙️ Open Settings',
    'progress': '📊 See my progress',
    'scenes': '🏞️ Pick a place',
    'tools': '🧰 Open the Toolshed',
    'share': '📤 Share my island',
    'backup': '💾 Save a backup now',
    'custom': '⏱️ Pick my own time',
    'call-14416': '📞 Call 14416 (India)',
    'helplines': '🌍 Find a helpline near you'
  };

  // Words that say little on their own when matching products (a student asking about essays is not
  // automatically asking for the AI-detector kit). They still count a little.
  var GENERIC = {};
  ('student students teacher teachers professor school college university class study studying exam exams test ' +
   'free help email reply letter notice essay essays assignment homework write writing proof plan guide app apps tool ' +
   'tools kit video videos money work course ebook template website the and for you your with this that from').split(' ')
    .forEach(function (w) { GENERIC[w] = true; });
  var STOP = {};
  ('a an and are as at be but by can do does for from get got has have how i if in into is it its just let lets me my ' +
   'no not of on or our out so than that the their them then there they this to too up us was we what when where who ' +
   'why will with you your yours im ive dont cant wont its youre').split(' ').forEach(function (w) { STOP[w] = true; });

  /* Topics. k: strong words (a phrase scores 3, a word 2), w: weak words (score 1).
     A word matches the start of a typed word ("distract" matches "distracted"); words of 3 letters or less, or
     ending in "$", must match a whole word. A word ending in "!" is distinctive ("streak!") and scores 3. say: the answer, "• " lines become a list. {streak} {next} {total}
     are filled from the person's own progress (lines are dropped if unknown). q: words used to find matching
     products, pre: the line shown above them. guides: study guides to suggest, in order (only published ones). */
  var TOPICS = [
    // ----- real-life problems the maker has made something for -----
    { id: 'ai', label: '🤖 Teacher says I used AI',
      k: ['ai detector', 'ai detection', 'detector', 'turnitin!', 'gptzero!', 'zerogpt!', 'copyleaks!', 'chatgpt', 'chat gpt',
        'about ai', 'is ai', 'was ai', 'ai checker', 'ai check', 'ai score', 'ai report', 'ai percent',
        'used ai', 'written by ai', 'ai written', 'ai generated', 'accused', 'flagged', 'cheating',
        'cheated', 'plagiari', 'academic integrity', 'misconduct', 'says i used', 'thinks i used', 'think i used'],
      say: ['That’s really stressful, especially when you did the work yourself. Some calm first steps:',
        '• Don’t panic, and don’t reply angrily.',
        '• Collect your proof: drafts, version history, notes, browser history.',
        '• Ask politely to talk about it. AI detectors can be wrong.'],
      w: ['ai$'],
      pre: 'The maker made something for exactly this:', q: 'ai detector accused of ai turnitin chatgpt',
      next: ['stress', 'writing'] },
    { id: 'tax', label: '📄 Scary IRS letter',
      k: ['irs', 'cp2000!', 'cp 2000', 'tax', 'taxes', 'tax return', 'underreport', '1099', 'owe more', 'audit'],
      say: ['A letter from the IRS can feel scary, but you have options:',
        '• Find the reply date first. Don’t ignore the letter.',
        '• If it’s a CP2000, it’s a proposal, not a bill. You can agree or disagree with it.',
        '• Gather your tax papers before you reply.'],
      pre: 'The maker made calm help for this (it’s not tax advice):', q: 'irs tax cp2000 notice',
      next: ['stress', 'shop'] },

    // ----- studying -----
    { id: 'focus', label: '😵 I can’t focus',
      k: ['cant focus', 'cannot focus', 'can not focus', 'not able to focus', 'unable to focus', 'lose focus', 'losing focus',
        'distract', 'concentrat', 'scrolling', 'waste time', 'wasting time', 'time waste', 'social media', 'reels', 'mind wander', 'attention span', 'dhyan', 'man nahi lagta', 'focus'],
      w: ['phone', 'instagram', 'youtube', 'tiktok', 'attention'],
      say: ['Totally normal. Your brain isn’t broken, it just needs a few walls. Try this:',
        '• Put your phone in another room, or face down on silent.',
        '• Pick ONE small task, like “read 3 pages”, not “study biology”.',
        '• Start a short timer and do only that until it rings.',
        '• A distracting thought? Write it on paper and deal with it later.',
        'Want a challenge? Phone-free mode makes your sprout droop if you leave the page.'],
      acts: ['start-25', 'settings'], next: ['procrastinate', 'music', 'phonefree'] },
    { id: 'procrastinate', label: '🐢 I keep putting it off',
      k: ['procrastinat', 'cant start', 'cannot start', 'cant get started', 'dont want to study', 'no motivation', 'motivat',
        'lazy', 'dont feel like', 'putting it off', 'put it off', 'padhne ka man', 'man nahi karta', 'aalas', 'bored', 'boring',
        'hate studying', 'hate study'],
      w: ['start'],
      say: ['Starting is the hardest part, so make it tiny:',
        '• Promise yourself just 2 minutes. You can stop after that if you want.',
        '• Open the book or file before you think about it.',
        '• Begin with the easiest bit to warm up.',
        'Most people keep going once they start. 🌱'],
      acts: ['start-2'], next: ['focus', 'plan'] },
    { id: 'exam', label: '⏰ Exam soon!',
      k: ['exam tomorrow', 'test tomorrow', 'exam today', 'test today', 'tomorrow exam', 'tomorrow test', 'tomorrow is my',
        'exam is tomorrow', 'last minute', 'night before', 'one day left', '1 day left', 'two days left', '2 days left',
        'few hours left', 'cram', 'exam soon', 'test soon', 'kal exam', 'kal paper', 'paper tomorrow', 'pariksha', 'exam', 'test'],
      w: ['tomorrow'],
      say: ['You can still do a lot. Stay calm and go smart:',
        '• List the topics most likely to come. Do those first.',
        '• Test yourself: past papers, or close the book and write what you remember.',
        '• Focus 50 minutes, rest 10. Drink water and eat something.',
        '• Sleep at least 6 hours. Your brain stores what you learned while you sleep.',
        'Good luck! You’ve got this. 💪'],
      acts: ['set-50-10', 'start-25'], next: ['memory', 'stress'] },
    { id: 'plan', label: '🗓️ Make a study plan',
      k: ['study plan', 'plan$', 'timetable', 'time table', 'schedule', 'routine', 'exam next week', 'exam in a week',
        'next month', 'in a month', 'in two weeks', 'in 2 weeks', 'weeks left', 'syllabus', 'how to prepare', 'prepare for', 'preparation', 'revision plan'],
      say: ['Here’s a simple plan that works:',
        '• Write every topic on one list. Mark each one easy, okay or hard.',
        '• Give hard topics more days, but touch every topic early.',
        '• Each day: learn something new, then quickly review older topics.',
        '• Keep the last few days for practice tests and review.',
        '• Aim for 3 to 5 focus sessions a day, not 12 hours. Steady wins.'],
      acts: ['set-50-10', 'progress'], next: ['memory', 'howlong'] },
    { id: 'howlong', label: '⏱️ How long should I study?',
      k: ['how long', 'how many hours', 'hours a day', 'how much time', 'how many minutes', 'pomodoro!', '50 10', '52 17',
        '25 5', 'session length', 'break time', 'how often'],
      w: ['break', 'breaks', 'hours', 'minutes'],
      say: ['There’s no perfect number. Pick what fits you:',
        '• 25 + 5 (Pomodoro): great when starting is hard.',
        '• 50 + 10: good for most homework and revision.',
        '• 90 + 15: deep work, once you’re used to focusing.',
        'In breaks, stand up, drink water, look out of a window. Not your phone! 😉'],
      acts: ['set-25-5', 'set-50-10', 'set-90-15'],
      guides: ['how-long-to-study-before-a-break', '50-10-study-method', '52-17-rule', 'pomodoro-vs-50-10-vs-52-17'],
      next: ['plan', 'timer'] },
    { id: 'memory', label: '🧠 Help me remember',
      k: ['remember', 'memoriz', 'memoris', 'forget', 'forgot', 'retain', 'recall', 'learn faster', 'flashcard', 'yaad', 'bhool'],
      w: ['revise', 'revision', 'learn'],
      say: ['Reading again and again feels like learning, but testing yourself works much better:',
        '• Close the book and write or say what you remember. Then check.',
        '• Review after 1 day, 3 days, then 1 week. Short reviews beat one long one.',
        '• Explain it in simple words, as if teaching a friend.',
        '• Turn your notes into questions and answer them later.'],
      acts: ['start-25'], next: ['plan', 'focus'] },
    { id: 'reading', label: '📖 I don’t understand it',
      k: ['confus', 'take notes', 'note taking', 'notes', 'read faster', 'textbook', 'chapter', 'difficult topic', 'hard topic',
        'hard subject', 'samajh'],
      w: ['dont understand', 'do not understand', 'understand', 'reading', 'read', 'maths', 'math', 'physics', 'chemistry', 'science', 'difficult', 'hard'],
      say: ['When something is hard to understand:',
        '• Skim first: headings, pictures, summary. Then read properly.',
        '• After each part, write 1 or 2 lines in your own words.',
        '• Still stuck? Try another explanation: a video, another book, or ask a friend or teacher.',
        '• For maths and science, do practice problems. Reading the answers isn’t enough.'],
      acts: ['start-25'], next: ['memory', 'focus'] },
    { id: 'writing', label: '✍️ Big assignment',
      k: ['homework', 'assignment', 'essay', 'project', 'thesis', 'dissertation', 'deadline', 'due tomorrow', 'due date'],
      w: ['write', 'writing', 'report', 'due'],
      say: ['Big work feels easier in small pieces:',
        '• Break it into steps: research, outline, draft, fix, submit.',
        '• Write a messy first draft. Fixing is easier than starting.',
        '• One step per focus session. Tick it off.',
        '• Keep your drafts and notes. Version history can also prove the work is yours.'],
      acts: ['set-50-10', 'start-25'], next: ['procrastinate', 'plan'] },
    { id: 'sleepy', label: '😴 I’m sleepy',
      k: ['sleepy', 'sleep', 'tired', 'exhausted', 'yawn', 'drowsy', 'no energy', 'low energy', 'fall asleep', 'neend', 'nind'],
      say: ['A tired brain learns slowly, so be kind to it:',
        '• Stand up, drink water, splash your face, move for 2 minutes.',
        '• Study at a desk with good light, not in bed.',
        '• Try a short 15-minute session, then decide.',
        '• If it’s late, go to sleep. A good night’s sleep helps you remember more than one more tired hour.'],
      acts: ['start-15'], next: ['plan', 'focus'] },
    { id: 'stress', label: '😟 I’m stressed',
      k: ['stress!', 'anxious!', 'anxiety!', 'panic!', 'overwhelm!', 'pressure', 'tension', 'scared', 'afraid', 'nervous', 'worried',
        'worry', 'depress!', 'hopeless!', 'cant do this', 'give up', 'giving up', 'lonely', 'ghabra', 'dar lag', 'overthink'],
      w: ['sad', 'cry', 'crying', 'upset'],
      say: ['That sounds really heavy. I’m sorry. 💛 Let’s slow down for a moment:',
        '• Breathe in for 4 counts, out for 6. Do it 5 times.',
        '• Write down only the ONE next small step.',
        '• Do just that, for 2 tiny minutes.',
        '• Eat, drink water and sleep. A tired body makes everything feel worse.',
        '• Tell someone you trust how you feel. You don’t have to carry it alone.',
        'If you’ve felt low for a long time, please talk to a doctor or counsellor. In India you can call Tele-MANAS on 14416, free, any time.'],
      acts: ['start-2', 'sounds'], next: ['exam', 'plan'] },
    { id: 'failed', label: '\uD83D\uDE1E I failed a test',
      k: ['failed!', 'i failed', 'fail my', 'failing', 'bad marks', 'low marks', 'less marks', 'poor marks', 'bad grade', 'low grade',
        'bad result', 'low score', 'flunk', 'backlog', 'compartment', 'didnt pass', 'did not pass', 'not pass'],
      say: ['I\u2019m sorry. That really hurts. \uD83D\uDC9B One result doesn\u2019t decide your future.',
        '\u2022 Today, be kind to yourself. Rest, eat, talk to someone.',
        '\u2022 Later, look at the paper calmly: which questions lost the most marks?',
        '\u2022 Change one thing for next time, like testing yourself instead of re-reading.',
        '\u2022 Ask your teacher what to work on. Most teachers like that question.'],
      next: ['plan', 'memory', 'stress'] },
    { id: 'music', label: '🎧 Study music',
      k: ['music', 'sound', 'lofi', 'lo fi', 'rain', 'noise', 'ocean', 'song', 'songs', 'headphone', 'earphone', 'silence', 'noisy', 'loud', 'volume',
        'no sound', 'cant hear', 'not playing', 'sound is not', 'sound not', 'music is not', 'music not', 'audio'],
      w: ['quiet', 'forest', 'campfire'],
      say: ['Calm sounds can help you focus. Songs with words usually distract, so try sounds without words:',
        '• Focus World has rain, ocean, forest, campfire, brown noise and lofi music.',
        '• Mix them in Sounds. They’re made on your device and work offline.',
        'Noisy around you? Brown noise covers voices well.',
        'No sound? Turn up your volume, check silent mode, then tap a sound in Sounds.'],
      acts: ['sounds'], guides: ['pomodoro-timer-with-lofi-music'], next: ['focus'] },

    { id: 'study', label: '📚 Help me study',
      k: ['study tips', 'help me study', 'how to study', 'study better', 'study more', 'study hard', 'padhai', 'study', 'studying'],
      w: ['learn'],
      say: ['Happy to help! What’s the hardest part right now?'],
      next: ['focus', 'procrastinate', 'exam', 'plan', 'memory', 'howlong', 'reading', 'writing', 'sleepy'] },

    // ----- using Focus World -----
    { id: 'what', label: '🌱 How does Focus World work?',
      k: ['focus world', 'how does it work', 'how it works', 'how does this work', 'how to use', 'how do i use', 'what is this',
        'what is focus', 'new here', 'first time', 'get started', 'getting started', 'beginner'],
      w: ['island', 'garden'],
      say: ['Focus World is a free focus timer that grows a little world:',
        '• Pick a time (15, 25, 50, 90 or your own) and tap Grow.',
        '• Focus until it rings, then take a short break.',
        '• Every focused minute grows your world: 31 things to unlock, from a sprout to a whale.',
        'No sign-up, no ads. Everything stays on your device.'],
      acts: ['start-2'], next: ['grow', 'scenes', 'streak', 'backup', 'install'] },
    { id: 'grow', label: '🌳 What can I unlock?',
      k: ['unlock', 'next item', 'what do i get', 'reward', 'collection', 'treasure', 'cottage', 'windmill', 'lighthouse', 'whale',
        'have i focused', 'i focused', 'my minutes', 'total minutes', 'my progress', 'total time', 'grow'],
      w: ['tree', 'items', 'things', 'progress'],
      say: ['Your world grows with focused minutes. A few things on the way:',
        '• A first sprout at 2 minutes, an apple tree at 25, a cottage at 420.',
        '• A windmill at 680, a lighthouse at 1,450, a friendly whale at 8,000.',
        'You’ve focused {total} so far. Next up: {next}.',
        'Stopping early still counts if you focused for at least 30 seconds.'],
      acts: ['progress'], next: ['scenes', 'streak'] },
    { id: 'streak', label: '🔥 Streaks',
      k: ['streak!', 'days in a row', 'in a row', 'every day', 'lost my streak', 'streak broke'],
      w: ['flame', 'daily'],
      say: ['Your streak counts days in a row with at least 2 focused minutes.',
        '• Miss a day and it starts again. Your world and minutes stay safe.',
        '• Tap the green flame at the top to see your week.',
        'Your streak right now: {streak}.'],
      acts: ['progress'], next: ['grow'] },
    { id: 'scenes', label: '🏞️ Places & scenes',
      k: ['scene', 'scenes', 'place', 'places', 'background', 'desert', 'underwater', 'rooftop', 'valley', 'zen', 'space garden',
        'change place', 'change scene', 'change background', 'snowy', 'peaks'],
      w: ['space', 'weather', 'snow'],
      say: ['Your garden visits a new place every day: a mountain valley, desert oasis, city rooftop, underwater dome, space garden and more.',
        '• Tap the place name at the top left to pick one yourself.',
        '• Or choose “New after every session”.',
        '• Focus more to unlock more. There are 20 places and moods.'],
      acts: ['scenes'], next: ['grow'] },
    { id: 'timer', label: '⏱️ Change the timer',
      k: ['change time', 'change the time', 'change timer', 'change the timer', 'custom', 'set time', 'set the time', 'timer length',
        'own time', 'longer', 'shorter', '2 hours', '120', '180', 'auto break', 'break starts'],
      w: ['timer', 'time', 'length'],
      say: ['Tap 15, 25, 50 or 90 above the start button. For your own time, tap the little sliders button next to them.',
        '• Focus: 1 to 180 minutes. Break: 1 to 60 minutes.',
        '• Breaks start on their own. You can turn that off in Settings.'],
      acts: ['custom', 'settings'], next: ['howlong', 'stop'] },
    { id: 'stop', label: '⏸️ Pausing & stopping',
      k: ['pause', 'stop', 'quit', 'leave early', 'cancel', 'what happens if', 'droop', 'wilt', 'my plant', 'my sprout', 'died'],
      say: ['You can pause or stop any time:',
        '• Stop early and your minutes still count if you focused for at least 30 seconds.',
        '• In phone-free mode there’s no pause. Leave the page for more than 10 seconds and your sprout droops, and that session doesn’t count.',
        'A droop isn’t forever. Just start again! 🌱'],
      next: ['phonefree', 'timer'] },
    { id: 'phonefree', label: '📵 Phone-free mode',
      k: ['phone free', 'strict', 'block apps', 'app blocker', 'block my phone', 'lock my phone', 'stop using my phone', 'stop using phone'],
      w: ['lock', 'block'],
      say: ['Phone-free mode is a challenge for big study days:',
        '• No pause button.',
        '• Leave this page for more than 10 seconds and your sprout droops.',
        '• Turn it on in Settings, under Focus helpers.',
        'It can’t lock other apps. It just gives you a good reason to stay. 😊'],
      acts: ['settings'], next: ['focus', 'stop'] },
    { id: 'account', label: '🔑 Do I need an account?',
      k: ['login', 'log in', 'sign in', 'sign up', 'signup', 'account', 'password', 'register'],
      say: ['No account and no sign-up. Your world is saved only on this device, in your browser.',
        'To use it on another phone or laptop, save a backup and load it there.'],
      acts: ['backup'], next: ['backup', 'free'] },
    { id: 'backup', label: '💾 Move to another phone',
      k: ['backup!', 'back up', 'lose my', 'will i lose', 'new phone', 'another phone', 'other phone', 'another device', 'other device', 'transfer', 'move my',
        'sync', 'cleared', 'clear data', 'clear my', 'deleted', 'disappear', 'restore', 'lost my', 'is gone', 'save my', 'saved'],
      w: ['lost', 'save', 'gone'],
      say: ['Your world lives only in this browser, on this device.',
        '• “Save backup” in Settings downloads a small file.',
        '• On your other device, open Focus World, then Settings → Load backup.',
        '• Clearing browser data erases your world, so save a backup now and then.',
        'Already lost it with no backup? Sadly it can’t come back, but a new world grows fast. 🌱'],
      acts: ['backup', 'settings'], next: ['install'] },
    { id: 'storage',
      k: ['storage', 'private mode', 'incognito', 'wont save', 'not saving', 'doesnt save', 'didnt save', 'did not save', 'cant save'],
      say: ['Your browser isn\u2019t letting Focus World save. This often happens in private or incognito windows, or when storage is full.',
        '\u2022 Open Focus World in a normal window.',
        '\u2022 Or free up some space on your device.',
        'Until then, save a backup so you don\u2019t lose your world.'],
      acts: ['backup'], next: ['backup'] },
    { id: 'install', label: '📲 Install it like an app',
      k: ['install!', 'download', 'home screen', 'homescreen', 'offline', 'no internet', 'without internet', 'play store',
        'app store', 'apk', 'iphone', 'android', 'ipad', 'laptop', 'computer', 'desktop', 'tablet', 'pc$', 'mac$', 'windows'],
      w: ['app$', 'internet', 'wifi'],
      say: ['No app store needed:',
        '• Android (Chrome): tap ⋮, then “Add to Home screen” or “Install app”.',
        '• iPhone (Safari): tap Share, then “Add to Home Screen”.',
        '\u2022 Laptop or computer: just open it in any browser. Chrome and Edge can install it too.',
        'After your first visit it works offline too.'],
      next: ['backup', 'notify'] },
    { id: 'notify', label: '🔔 Time’s-up alerts',
      k: ['notification!', 'notify', 'alarm', 'alert', 'ding', 'chime', 'another tab', 'other tab', 'reminder', 'remind me', 'screen off', 'screen on',
        'screen sleep', 'screen goes', 'screen turns off', 'keep screen', 'keep the screen'],
      w: ['ring', 'remind'],
      say: ['In Settings:',
        '• “Tell me when time’s up” gives a gentle ping when you’re in another tab.',
        '• “Ding at the end” sets how loud the chime is.',
        '• “Keep screen on” stops your screen sleeping while you focus.',
        'There are no daily reminders yet.'],
      acts: ['settings'], next: ['install'] },
    { id: 'look', label: '🌙 Calm mode & sky',
      k: ['calm mode', 'animation', 'lag', 'laggy', 'slow', 'battery', 'old phone', 'sky', 'night mode', 'dark mode', 'theme',
        'colour', 'color', 'too bright', 'sunset'],
      say: ['Make it yours in Settings, under Look & feel:',
        '• Calm mode: less movement. Kinder to older phones and batteries.',
        '• Sky: live (follows your clock), morning, day, sunset or night.'],
      acts: ['settings'], next: ['scenes'] },
    { id: 'reset', label: '🌱 Start a new island',
      k: ['reset', 'start over', 'new island', 'new world', 'erase', 'fresh start', 'delete my', 'start again from'],
      say: ['To start fresh: Settings → “Start a brand-new island”.',
        'Save a backup first if you might want your old world back.'],
      acts: ['backup', 'settings'] },
    { id: 'share', label: '📤 Share my island',
      k: ['share', 'show my friends', 'show friends', 'send to friend', 'screenshot', 'picture of my', 'invite'],
      say: ['Tap Share to make a picture of your world with your focus time. Send it to friends or save it.'],
      acts: ['share'] },
    { id: 'free', label: '💸 Is it free?',
      k: ['is it free', 'free$', 'cost', 'pay', 'paid', 'charge', 'ads', 'advert', 'subscription', 'premium', 'privacy', 'my data',
        'tracking', 'track me', 'safe', 'spy'],
      say: ['Yes, Focus World is free. No sign-up, no ads, and what you do here isn’t tracked.',
        '• Your world is saved only on your device.',
        '• The Toolshed has helpers from the maker. Some are free, some are paid, and they keep Focus World free.'],
      acts: ['tools'], next: ['account', 'maker'] },
    { id: 'promo',
      k: ['promo', 'popup', 'pop up', 'hide the card', 'close the card', 'card during', 'annoying'],
      say: ['During breaks you may see one small card from the maker. That\u2019s how Focus World stays free with no ads.',
        'Tap \u2715 on it and it hides until your next break.'],
      next: ['free'] },
    { id: 'language', label: '🗣️ Other languages',
      k: ['hindi', 'language', 'bengali', 'manipuri', 'meitei', 'tamil', 'telugu', 'marathi', 'urdu', 'spanish', 'french', 'translate'],
      say: ['Right now Focus World and I only speak simple English. More languages may come later!'] },

    // ----- the maker -----
    { id: 'shop', label: '🧰 Something else is wrong',
      k: ['product', 'products', 'shop', 'store', 'buy', 'sell', 'toolshed', 'what else', 'something else', 'other problem',
        'different problem', 'not study', 'real life', 'your apps', 'your kits', 'what do you have', 'recommend'],
      w: ['kit', 'ebook', 'course', 'tools'],
      say: ['Tell me in a few words what’s going on, like “my teacher says I used AI”, and I’ll look.'],
      pre: 'Here’s everything the maker has made:', all: true, acts: ['tools'] },
    { id: 'maker', label: '💌 Talk to the maker',
      k: ['who made', 'who built', 'who created', 'maker', 'creator', 'developer', 'contact', 'feedback', 'suggest', 'idea',
        'bug', 'not working', 'doesnt work', 'broken', 'error', 'report', 'complain'],
      say: ['Focus World is made by one person, with a lot of love. 💛',
        'Something broken? Try reloading the page first.',
        'Want to say hi, share an idea or report a problem? Message the maker here:'],
      acts: ['follow'] },
    { id: 'follow', label: '👋 Follow the maker',
      k: ['instagram', 'follow', 'social', 'facebook', 'twitter', 'telegram', 'whatsapp', 'youtube channel'],
      say: ['Say hi to the maker here:'], acts: ['follow'] },

    // ----- small talk -----
    { id: 'thanks', k: ['thank', 'thanks', 'thx', 'ty$', 'great', 'awesome', 'love it', 'helpful', 'dhanyavad', 'shukriya'],
      say: ['You’re welcome! 🌱 Go grow something lovely.'], acts: ['start-25'] },
    { id: 'ok', k: ['ok$', 'okay', 'okk', 'yes$', 'yeah', 'yep', 'sure$', 'no$', 'nope', 'lol$', 'hmm', 'what$', 'cool$', 'nice$'],
      say: ['Okay! Anything else? Tap a button or type a few words. \uD83C\uDF31'], next: 'main' },
    { id: 'bye', k: ['bye', 'goodbye', 'good night', 'see you', 'gn$'], say: ['Bye! Come back any time. 🌱'] },
    { id: 'hello', k: ['hi$', 'hii', 'hello', 'hey', 'helo', 'namaste', 'good morning', 'good evening', 'good afternoon', 'yo$', 'sup$'],
      say: ['Hi! 🌱 What’s going on today?'], next: 'main' },
    { id: 'menu', label: '💬 What can you do?',
      k: ['help$', 'what can you do', 'what do you do', 'who are you', 'are you ai', 'are you an ai', 'are you a bot', 'are you human',
        'are you real', 'are you chatgpt', 'is pip', 'you an ai', 'you a bot', 'is this a bot', 'is this an ai'],
      w: ['menu', 'options'],
      say: ['I’m Pip, a little helper bot. I’m not an AI: I know a set of answers, and I know them well! I can help you:',
        '• study better and stop getting distracted',
        '• use Focus World',
        '• find something from the maker for a problem you’re facing'],
      next: 'main' }
  ];
  var MAIN = ['study', 'focus', 'exam', 'stress', 'what', 'shop'];

  // A person in danger needs a person, not a study tip. Checked before anything else.
  var CRISIS = ['suicid', 'kill myself', 'killing myself', 'end my life', 'end it all', 'want to die', 'wanna die', 'wish i was dead',
    'wish i were dead', 'better off dead', 'self harm', 'selfharm', 'hurt myself', 'hurting myself', 'cut myself', 'cutting myself',
    'no reason to live', 'dont want to live', 'dont want to be alive', 'mar jaunga', 'mar jaungi', 'marna chahta', 'marna chahti',
    'aatmahatya', 'atmahatya', 'khudkushi'];
  var CRISIS_REPLY = {
    id: 'crisis',
    say: ['I’m really sorry you’re feeling this way. You matter, and you deserve support from a real person right now. 💛',
      '• If you might act on these thoughts, call your local emergency number now (112 in India).',
      '• In India, call Tele-MANAS on 14416. It’s free, any time, in many languages.',
      '• Outside India, find a free helpline in your country below.',
      '• Message or call someone you trust and tell them how you feel.',
      'I’m only a simple helper bot, so please reach out to one of them.'],
    acts: ['call-14416', 'helplines'], chips: []
  };

  // ---------- text matching ----------
  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[‘’ʼ']/g, '')            // can't -> cant
      .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')         // keep letters, numbers (and Hindi letters)
      .replace(/\s+/g, ' ').trim();
  }
  function tokens(norm) { return norm ? norm.split(' ') : []; }

  // Small typo allowance: Damerau-Levenshtein distance, capped (we only care about 0 or 1).
  function dist(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  function parseKey(kw) {
    var strong = kw.charAt(kw.length - 1) === '!';
    if (strong) kw = kw.slice(0, -1);
    var exact = kw.charAt(kw.length - 1) === '$';
    if (exact) kw = kw.slice(0, -1);
    return { kw: kw, exact: exact, full: strong ? 3 : 2 };
  }
  // Exact match of one keyword: 3 phrase or distinctive word, 2 word, 0 none. Marks the typed words it used.
  function exactHit(k, norm, toks, used) {
    if (k.kw.indexOf(' ') >= 0) {
      // Phrase: its words in order, each starting a typed word ("cant focus" matches "cant focusing").
      return (' ' + norm).indexOf(' ' + k.kw) >= 0 ? 3 : 0;
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === k.kw || (!k.exact && k.kw.length >= 4 && t.indexOf(k.kw) === 0)) { used[i] = true; return k.full; }
    }
    return 0;
  }
  // A typo ("procastinate") in a typed word nothing else matched: 2 for long words, 1 (a hint) for short ones.
  function typoHit(k, toks, used) {
    if (k.exact || k.kw.length < 5 || k.kw.indexOf(' ') >= 0) return 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (used[i] || t.length < 4 || t.charAt(0) !== k.kw.charAt(0)) continue;
      for (var L = k.kw.length - 1; L <= k.kw.length + 1; L++) {
        if (t.length >= L && dist(t.slice(0, L), k.kw) <= 1) { used[i] = true; return k.kw.length >= 7 ? 2 : 1; }
      }
    }
    return 0;
  }

  function scoreTopic(topic, norm, toks) {
    var s = 0, used = {}, missed = [];
    var strong = (topic.k || []).map(parseKey), weak = (topic.w || []).map(parseKey);
    strong.forEach(function (k) { var h = exactHit(k, norm, toks, used); if (h) s += h; else missed.push(k); });
    weak.forEach(function (k) { if (exactHit(k, norm, toks, used)) s += 1; });
    missed.forEach(function (k) { s += typoHit(k, toks, used); });
    return s;
  }

  function isCrisis(norm) {
    var pad = ' ' + norm;
    return CRISIS.some(function (kw) { return pad.indexOf(' ' + kw) >= 0; });
  }

  // ---------- products (from My Shop) ----------
  function termIn(term, norm, toks) {
    if (term.indexOf(' ') >= 0) {
      var pad = ' ' + norm + ' ';
      return pad.indexOf(' ' + term + ' ') >= 0 || pad.indexOf(' ' + term + 's ') >= 0;
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === term || t === term + 's' || (term.length >= 5 && t.indexOf(term) === 0)) return true;
    }
    return false;
  }
  function productScore(p, norm, toks) {
    var s = 0, seen = {};
    var name = normalize(String(p.id || '').replace(/-/g, ' '));
    if (name.indexOf(' ') > 0 && termIn(name, norm, toks)) s += 3;
    (p.tags || []).forEach(function (tag) {
      var t = normalize(tag);
      if (!t || seen[t]) return;
      seen[t] = true;
      if (termIn(t, norm, toks)) s += GENERIC[t] ? 1 : 3;
    });
    // Words from the title and hook count a little, so products without good tags can still be found.
    tokens(normalize([p.title, p.hook, p.kicker].join(' '))).forEach(function (w) {
      if (w.length < 4 || STOP[w] || GENERIC[w] || seen[w]) return;
      seen[w] = true;
      if (termIn(w, norm, toks)) s += 1;
    });
    return s;
  }
  function findProducts(text, products, min, max) {
    var norm = normalize(text), toks = tokens(norm);
    if (!norm) return [];
    return (products || []).map(function (p, i) { return { p: p, s: productScore(p, norm, toks), i: i }; })
      .filter(function (x) { return x.s >= min; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; })   // ties keep the order set in My Shop
      .slice(0, max).map(function (x) { return x.p; });
  }

  // ---------- answers ----------
  function chip(id) {
    var t = topicById(id);
    return t && t.label ? { label: t.label, topic: t.id } : null;
  }
  function topicById(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i];
    return null;
  }
  function fill(lines, ctx) {
    var out = [];
    lines.forEach(function (line) {
      var missing = false;
      var s = line.replace(/\{(\w+)\}/g, function (m, key) {
        var v = ctx && ctx[key];
        if (v == null || v === '') { missing = true; return ''; }
        return String(v);
      });
      if (!missing) out.push(s);
    });
    return out;
  }
  function mainChips() { return MAIN.map(chip).filter(Boolean); }

  // Turn a topic into an answer the chat can show.
  function answer(topic, ctx, extraText) {
    ctx = ctx || {};
    var products = ctx.products || [];
    var out = { id: topic.id, say: fill(topic.say, ctx), pre: null, products: [], acts: [], guides: [], chips: [] };
    var found = [];
    if (topic.all) found = products.slice(0, 6);
    else {
      if (topic.q) found = findProducts(topic.q, products, 3, 2);
      if (extraText) {
        findProducts(extraText, products, 3, 2).forEach(function (p) { if (found.indexOf(p) < 0) found.push(p); });
      }
      found = found.slice(0, 2);
    }
    if (found.length) { out.pre = topic.pre || 'This might help:'; out.products = found; }
    else if (topic.all) out.say = ['The maker\u2019s shelf is still being stocked. Check back soon! \uD83C\uDF31'];
    out.acts = (topic.acts || []).filter(function (a) {
      if (a === 'follow') return !!ctx.hasSocial;
      return !!ACTIONS[a];
    });
    if (topic.id === 'maker' && !ctx.hasSocial) out.say = out.say.slice(0, 2);
    if (topic.id === 'follow' && !ctx.hasSocial) out.say = ['The maker’s social links aren’t up yet. Check back soon!'];
    var have = {};
    (ctx.guides || []).forEach(function (g) { have[g.slug] = g; });
    out.guides = (topic.guides || []).filter(function (s) { return have[s]; }).slice(0, 2).map(function (s) { return have[s]; });
    var next = topic.next === 'main' ? MAIN : (topic.next || []);
    out.chips = next.map(chip).filter(Boolean);
    if (!out.chips.length && topic.id !== 'crisis') out.chips = mainChips().filter(function (c) { return c.topic !== topic.id; }).slice(0, 4);
    return out;
  }

  function welcome(ctx) {
    return { id: 'welcome', say: ['Hi! I’m Pip 🌱 Tell me what’s going on, or tap a button.'],
      pre: null, products: [], acts: [], guides: [], chips: mainChips() };
  }

  /* The main entry: what someone typed -> an answer. ctx: { products, guides, hasSocial, streak, next, total } */
  function reply(text, ctx) {
    ctx = ctx || {};
    var norm = normalize(text), toks = tokens(norm);
    if (!norm) return welcome(ctx);
    if (isCrisis(norm)) {
      var c = {}; for (var k in CRISIS_REPLY) c[k] = CRISIS_REPLY[k];
      c.pre = null; c.products = []; c.guides = [];
      return c;
    }
    var best = null, bestScore = 0, second = null, secondScore = 0;
    TOPICS.forEach(function (t) {
      var s = scoreTopic(t, norm, toks);
      if (s > bestScore) { second = best; secondScore = bestScore; best = t; bestScore = s; }
      else if (s > secondScore) { second = t; secondScore = s; }
    });
    if (best && bestScore >= 2) {
      var out = answer(best, ctx, text);
      // A second clear topic in the same message ("exam tomorrow and I can't focus") becomes the first button.
      if (second && secondScore >= 3 && second.label) {
        out.chips = [chip(second.id)].concat(out.chips.filter(function (c) { return c.topic !== second.id; })).slice(0, 6);
      }
      return out;
    }
    // Not understood. Maybe a product still fits what they wrote.
    var found = findProducts(text, ctx.products, 3, 2);
    return { id: 'unknown',
      say: found.length ? ['I’m not sure I understood, but this might be what you need:']
        : ['Hmm, I didn’t catch that. I’m a simple helper (not an AI), so a few short words work best, like “can’t focus” or “exam tomorrow”.'],
      pre: null, products: found, acts: [], guides: [], chips: mainChips() };
  }

  // Pressing a quick-reply button skips guessing and answers that topic directly.
  function replyTopic(id, ctx) {
    var t = topicById(id);
    return t ? answer(t, ctx || {}, '') : welcome(ctx);
  }

  var api = { ACTIONS: ACTIONS, TOPICS: TOPICS, MAIN: MAIN, normalize: normalize, reply: reply, replyTopic: replyTopic,
    welcome: welcome, findProducts: findProducts, isCrisis: function (s) { return isCrisis(normalize(s)); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FWHelper = api;
})(this);
