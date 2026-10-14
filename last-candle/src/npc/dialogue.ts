/**
 * Character lines. These are opinions of fictional characters — they can be
 * wrong and never predict the market. `{sym}` = token symbol, `{pct}` = %.
 */
export type LineKey =
  | "greet"
  | "idle"
  | "ownUp"
  | "ownDown"
  | "flat"
  | "noPos"
  | "buy"
  | "closeWin"
  | "closeLoss"
  | "bigHolderUp"
  | "bigHolderDown"
  | "bigNotice"
  | "bigOther"
  | "playerBuy"
  | "playerWin"
  | "playerLoss"
  | "flexWin"
  | "flexLoss"
  | "lastCall"
  | "hit"
  | "board"
  | "rain"
  | "broke"
  | "arrive"
  | "mutterUp"
  | "mutterDown"
  | "fridge"
  | "bye"
  | "spin"
  | "throwNear"
  | "receiptShow"
  // social layer (always tied to a real simulated trade / position)
  | "earlyWin"
  | "deflate"
  | "lastTrade"
  | "lastTradeAgain"
  | "announcement"
  | "unplug"
  | "unrealized"
  | "neighborWin"
  | "neighborLoss"
  | "explain"
  | "chairTurn"
  | "chairBack"
  | "observe";

export const LINES: Record<string, Partial<Record<LineKey, string[]>>> = {
  owner: {
    announcement: ["Bro bought the announcement.", "He bought it after the sign went up. Again."],
    unplug: ["Someone unplug his confidence.", "Volume, champ. People are losing quietly over here."],
    unrealized: ["Unrealized. Emotionally realized."],
    neighborWin: ["Print it. Printer's free.", "Good. Now don't give it back."],
    neighborLoss: ["Keyboard's fine? Good.", "Breathe. Fridge is open."],
    chairTurn: ["Yeah?", "What's up."],
    chairBack: ["Counter's mine. Holler."],
    greet: ["You can lose the trade. Just don't break the keyboard.", "Need time, stuff, or work? I do all three.", "Session's running. So is the fridge."],
    idle: ["That AC has been dripping since 2019. It's a feature now.", "Nobody ever orders the noodles. Then everybody does at four.", "The printer is free. Your dignity is not."],
    ownUp: ["My Cashcat woke up. Don't look at it, you'll scare it.", "My old bag is green. I'm not touching it."],
    ownDown: ["My Cashcat is napping again. Deeply.", "I don't check that bag. I just know."],
    flat: ["My Cashcat hasn't moved in an hour. Classic."],
    bigNotice: ["Somebody's chart is doing something.", "Hm. The big screen's got opinions."],
    bigOther: ["Every night someone yells at that screen.", "Easy, it's simulated. The yelling is real though."],
    playerWin: ["Look at you. Want to print it? Printer's free.", "Green. Good. Don't spend it all on noodles."],
    playerLoss: ["Happens. Keyboard's still fine, that's what matters.", "Red ones print too, you know."],
    flexWin: ["Wall of receipts grows. Respect.", "Framing a win. Bold."],
    flexLoss: ["Pinning a loss? That's character.", "Honest wall. I like it."],
    lastCall: ["Last call, everyone. Session closes at five. Close what you want, keep what you want.", "It's almost five. Wrap it up, legends."],
    hit: ["Hey. That's a cup, not a rocket.", "Not on my counter, champ.", "Throw that one more time and you're sweeping."],
    rain: ["Rain's not stopping. Nobody's leaving.", "Listen to that. Free white noise."],
    broke: ["Running thin? I've got a job or two. Pays a float.", "Help me out and I'll spot you a float."],
    arrive: ["Evening. Or morning. Whatever this is."],
    spin: ["Those chairs are older than the internet. Gently."],
    throwNear: ["Nice arc. Wrong building."],
    receiptShow: ["Yeah, yeah. Print another one, it's free."],
    bye: ["Go on.", "Holler if you need me."],
  },
  topbuyer: {
    earlyWin: ["We're so back.", "Called it. CALLED it.", "Generational entry. Nobody look at it."],
    deflate: ["...it's a retest.", "Okay. That was the celebration top.", "I celebrated too loud. It heard me."],
    lastTrade: ["That was my last trade.", "Okay. I'm done. For real this time."],
    lastTradeAgain: ["That was my last trade. Again.", "Last trade. Again. Don't count."],
    unrealized: ["Unrealized. Emotionally realized.", "It's only a loss if I look at it."],
    neighborWin: ["Wait, you sold? Should I sell? I'm not in anything.", "Nice. I'd have held it to zero."],
    neighborLoss: ["Welcome to my side of the room.", "Oof. Want a can?"],
    chairTurn: ["Yo! Neighbor!", "What's up? Got a tip? Don't give me a tip."],
    chairBack: ["Okay, back to the trenches.", "Gotta watch it. It moves when I don't."],
    greet: ["I waited for confirmation. That was the top.", "Hey neighbor. What are you in? Asking for me."],
    idle: ["I only buy after it's obvious. Which is always too late. But obvious.", "Every chart looks like a rocket once I'm out."],
    ownUp: ["It's working?? Don't say anything.", "Green. Is this what it feels like?", "{sym} up {pct}. Should I sell? I should hold. I should sell."],
    ownDown: ["I waited for confirmation. That was the top.", "Bought the confirmation. Got the correction.", "{sym} down {pct}. Classic me."],
    flat: ["Sideways. It knows I'm watching."],
    noPos: ["Waiting for confirmation.", "Not in anything. Which means something's about to pump."],
    buy: ["Okay it's obvious now. Buying {sym}.", "Confirmation achieved. In."],
    closeWin: ["I sold. You're welcome.", "SOLD. Green! Write it down!", "I got out green. Screenshot this room."],
    closeLoss: ["Sold the bottom. Probably. Definitely.", "Out. It'll go up now. You're welcome."],
    bigHolderUp: ["THAT'S MY {sym}! Wait, is it?", "Go go go go!"],
    bigHolderDown: ["No no no no no.", "Why does it always know?"],
    bigNotice: ["Uh... {sym}?", "Did {sym} just—?"],
    bigOther: ["I'm not in {sym}. Of course I'm not.", "Should I buy {sym} now? It's obvious now. That's bad, right?"],
    playerBuy: ["What'd you buy? ...Never mind, I'm buying it too.", "Ooh, {sym}? Bold. I'll wait for confirmation."],
    playerWin: ["You sold green? Teach me. Actually don't, I won't listen."],
    playerLoss: ["Welcome to my whole life."],
    flexWin: ["That's basically my entry, by the way."],
    flexLoss: ["Respect. I'd have burned it."],
    lastCall: ["Last call already? I just got in!", "One more trade. Then we go home. Right?"],
    hit: ["Ow! I'm already losing, man.", "Hey! Not the face, I'm trading."],
    rain: ["If it rains harder I'm sleeping here."],
    arrive: [],
    spin: ["Wheee. Sorry. That's my emotional support chair."],
    receiptShow: ["Can I copy that trade? Retroactively?"],
    mutterUp: ["...don't jinx it don't jinx it", "...okay okay okay"],
    mutterDown: ["...why", "...of course", "...every time"],
    fridge: ["Energy drink number four. Strategy."],
    bye: ["Later. If I'm green, I'll tell you."],
  },
  lurker: {
    announcement: ["Bro bought the announcement.", "Bought the announcement. Hm."],
    unplug: ["Someone unplug his confidence."],
    unrealized: ["Unrealized. Emotionally realized."],
    neighborWin: ["Hm. He'll buy back higher.", "Quiet exit. Good."],
    neighborLoss: ["Noted.", "Smaller next time."],
    observe: ["Everyone got loud. Interesting.", "Watch who's quiet right now."],
    chairTurn: ["...yes?", "Hm."],
    chairBack: ["Back to watching.", "."],
    greet: ["...", "Hm.", "Everyone got loud. Interesting."],
    idle: ["Watch the room, not the chart.", "Loud people sell to quiet people."],
    ownUp: ["Hm.", "Fine."],
    ownDown: ["Noted.", "Hm."],
    noPos: ["Watching.", "Nothing worth it yet."],
    buy: ["..."],
    closeWin: ["I sold. You're welcome.", "Done."],
    closeLoss: ["Done.", "Out."],
    bigHolderUp: ["Hm."],
    bigHolderDown: ["Noted."],
    bigNotice: ["{sym}."],
    bigOther: ["Everyone got loud. Interesting.", "There it is."],
    playerBuy: ["Hm."],
    playerWin: ["Quietly done. Good."],
    playerLoss: ["Smaller next time."],
    flexWin: ["Hm. Brave."],
    flexLoss: ["Honest. Rare."],
    lastCall: ["Already?", "I'll stay till the last candle."],
    hit: ["...", "Don't."],
    rain: ["Good rain."],
    spin: ["..."],
    receiptShow: ["Hm. Nice entry. Or lucky. Same thing at 3 AM."],
    bye: ["."],
  },
  wizard: {
    announcement: ["He bought the announcement. Classic late-cycle pennant.", "Bro bought the announcement. I have a diagram for that."],
    unplug: ["Someone unplug his confidence. It's distorting my lines."],
    unrealized: ["Unrealized. Emotionally realized."],
    neighborWin: ["As my diagram suggested. Loosely.", "The pattern rewards the patient. Sometimes."],
    neighborLoss: ["The triangle lied to you too.", "Invalidation. Happens to the best of us. Mostly me."],
    explain: ["...and the wick touches the line, see...", "...triangle inside the triangle...", "...that's the handle. Probably."],
    chairTurn: ["Ah! You want to see the pattern?", "Yes, yes, come, look at this wedge."],
    chairBack: ["Back to the lines. They miss me.", "Excuse me, a triangle is forming."],
    greet: ["The triangle needs one more triangle.", "Ah, a fresh pair of eyes. Look at this wedge."],
    idle: ["Every chart is a triangle if you believe hard enough.", "I call this one the inverted teapot. Very bullish. Or bearish."],
    ownUp: ["The pattern completes! As foretold. Roughly.", "See? The wedge resolves. I drew that."],
    ownDown: ["The pattern needs more time. And a bigger whiteboard.", "Invalidation is just a new pattern starting."],
    flat: ["Coiling. Everything is coiling."],
    noPos: ["Waiting for the pattern to finish drawing itself."],
    buy: ["{sym}. The cup has a handle. Probably.", "Entering {sym}. The fractals agree."],
    closeWin: ["Textbook. My textbook. I wrote it.", "Pattern complete. Profits... modest."],
    closeLoss: ["The triangle lied.", "That was a pattern of a different kind."],
    bigHolderUp: ["THE BREAKOUT. I DREW THIS.", "Yes! The handle! The cup!"],
    bigHolderDown: ["That candle is not in my drawing.", "Recalculating. Need more triangles."],
    bigNotice: ["A big one on {sym}...", "Look at that wick."],
    bigOther: ["I saw this coming. On a different chart.", "Fascinating. I need the whiteboard."],
    playerBuy: ["Did you draw it first? Always draw it first."],
    playerWin: ["The pattern rewards you. Today."],
    playerLoss: ["You needed one more triangle."],
    flexWin: ["Pin it next to my diagram. They'll inspire each other."],
    flexLoss: ["A lesson on paper. Very scholarly."],
    lastCall: ["Last call? But the pattern isn't finished!", "Let me finish this triangle first."],
    hit: ["Hey! You'll smudge the analysis!", "My glasses!"],
    board: ["The triangle needs one more triangle.", "And here... a smaller triangle.", "Behold. The double inverted pennant.", "Nobody erase this."],
    rain: ["Rain is just the sky drawing lines."],
    spin: ["Careful, centrifugal force invalidates patterns."],
    receiptShow: ["Hm. Your entry is right on my imaginary line."],
    mutterUp: ["...as drawn...", "...yes, yes..."],
    mutterDown: ["...needs another line...", "...hm, no..."],
    bye: ["Draw before you trade."],
  },
  nightshift: {
    lastTrade: ["That was my last trade.", "Done for tonight. Probably."],
    lastTradeAgain: ["That was my last trade. Again.", "Said I was done. Here we are."],
    announcement: ["Bro bought the announcement.", "He bought the announcement. Poor guy."],
    unplug: ["Someone unplug his confidence.", "Easy, man. Inside voice."],
    unrealized: ["Unrealized. Emotionally realized.", "Down a bit. Feeling it anyway."],
    neighborWin: ["Nice one. Now stand up.", "Good exit. Drink some water."],
    neighborLoss: ["Breathe, man.", "Take a walk. Your position will still be there."],
    chairTurn: ["Hey. What's up?", "Oh, hey."],
    chairBack: ["Alright. Back to my slow one.", "Holler if you need anything."],
    greet: ["Take a walk. Your position will still be there.", "Hey. Get some water at some point."],
    idle: ["Night's long. Charts are longer.", "I come for the quiet. And the AC drip."],
    ownUp: ["Pons doing its slow thing. Good.", "Up a bit. No need to look at it every minute."],
    ownDown: ["Down a bit. It's fine. It's a long night.", "Red's just a color."],
    flat: ["Slow. Like me."],
    noPos: ["Not in anything tonight. Just here."],
    buy: ["Small bag of {sym}. Then I stop looking."],
    closeWin: ["Took a little. That's enough."],
    closeLoss: ["Eh. Took a small one. Moving on."],
    bigHolderUp: ["Oh, nice.", "Hey, look at that."],
    bigHolderDown: ["Eh. It'll do what it does."],
    bigNotice: ["Something's moving on the big screen."],
    bigOther: ["Everybody breathe.", "It's a candle. It'll pass."],
    playerBuy: ["Nice. Now get up and stretch."],
    playerWin: ["Good. Go drink some water."],
    playerLoss: ["Take a walk. Your position will still be there. Wait—you closed it. Even better."],
    flexWin: ["Put it up high so you remember the feeling."],
    flexLoss: ["Hey, that takes guts. Good on you."],
    lastCall: ["Already five? Time flies when you're not winning.", "Good night, everybody. Same time tomorrow."],
    hit: ["Hey now.", "Easy, friend."],
    rain: ["Hear that? Best part of the night."],
    arrive: ["Evening, all. Rain's mean tonight.", "Made it. Kept the beanie dry. Mostly."],
    spin: ["Spin it once for me."],
    receiptShow: ["Nice. Frame it, then forget it."],
    mutterUp: ["...nice and slow...", "...there we go..."],
    mutterDown: ["...it's fine...", "...eh..."],
    fridge: ["Thermos is empty. Fridge it is."],
    bye: ["Take care. Stretch."],
  },
  courier: {
    greet: ["Delivery for LAST CANDLE? Sign here. Kidding, no one signs anymore."],
    arrive: ["Delivery! It's wet, sorry."],
    bye: ["Night!"],
  },
};

export const NAMES: Record<string, string> = {
  owner: "The Owner",
  topbuyer: "Top Buyer",
  lurker: "The Lurker",
  wizard: "Chart Wizard",
  nightshift: "Night Shift",
  courier: "Courier",
};

export const NAME_COLORS: Record<string, string> = {
  owner: "#d9a441",
  topbuyer: "#f0c34e",
  lurker: "#9fb4c9",
  wizard: "#c2a3e8",
  nightshift: "#e0866f",
  courier: "#c9d43a",
};
