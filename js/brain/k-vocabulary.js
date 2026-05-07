// Real K-grade English vocabulary (~2000 words) for
// definition-comprehension teach via the live dictionary API.
// Operator-quoted rationale lives in TODO.md  entry; this
// file only carries the vocabulary itself.

// Composition (compiled from public-domain reference lists):
//   - Letters + letter names (52 entries: a-z + A-Z)
//   - Number names (0-100 + ordinals + math operators)
//   - Dolch sight words (220 — pre-K through G3 high-frequency)
//   - Fry instant words first 300 (high-frequency English overlap)
//   - K-grade content words by subject: ELA, Math, Science (animals /
//     plants / weather / body / earth), Social Studies (family /
//     community / nation / geography), Art (colors / shapes / music),
//     Life (emotions / time / activities / household)
//   - Common verbs + adjectives + prepositions

// Total deduplicated entries: ~2000 (varies slightly per dedup pass).
// Each word here gets sem(word) → sem(def_token) Hebbian binding via
// _teachWordDefinitions(K_VOCABULARY) called at K curriculum start.
// Definitions fetched live from dictionaryapi.dev (cached on disk by
// the in-memory Map in server/definition-service.js).

// Equational cognition stays intact — API output is sensory I/O,
// the actual learning is Oja-Hebbian via _teachAssociationPairs.

const K_VOCABULARY_RAW = [
  // ─── Letters (lowercase) ─────────────────────────────────────────
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',

  // ─── Number names + math basics ──────────────────────────────────
  'zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million',
  'first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','last',
  'plus','minus','times','divided','equal','equals','add','subtract','multiply','divide','sum','total',
  'more','less','greater','smaller','bigger','count','counting','number','numbers','digit','digits',
  'half','quarter','double','triple','dozen','pair','few','many','several','some','none','all',

  // ─── Dolch sight words (220) ─────────────────────────────────────
  'the','of','and','to','in','is','you','that','it','he','was','for','on','are','as','with','his','they','at',
  'be','this','from','have','or','one','had','by','word','but','not','what','were','we','when','your','can','said',
  'there','use','an','each','which','she','do','how','their','if','will','up','other','about','out','many','then',
  'them','these','so','some','her','would','make','like','him','into','time','has','look','two','more','write','go',
  'see','no','way','could','my','than','first','been','call','who','its','now','find','long','down','day','did','get',
  'come','made','may','part','over','new','sound','take','only','little','work','know','place','years','live','me',
  'back','give','most','very','after','things','our','just','name','good','sentence','man','think','say','great','where',
  'help','through','much','before','line','right','too','means','old','any','same','tell','boy','follow','came','want',
  'show','also','around','form','three','small','set','put','end','does','another','well','large','must','big','even',
  'such','because','turn','here','why','asked','went','men','read','need','land','different','home','us','move','try',
  'kind','hand','picture','again','change','off','play','spell','air','away','animal','house','point','page','letter',
  'mother','answer','found','study','still','learn','should','america','world','high','every','near','add','food',
  'between','own','below','country','plant','school','father','keep','tree','never','start','city','earth','eyes',
  'light','thought','head','under','story','saw','left','few','while','along','might','close','something','seem',

  // ─── Fry instant words (additional high-frequency) ───────────────
  'next','hard','open','example','begin','life','always','those','both','paper','together','got','group','often',
  'run','important','until','children','side','feet','car','mile','night','walk','white','sea','began','grow','took',
  'river','carry','state','book','science','eat','room','friend','idea','fish','mountain','stop','once','base','hear',
  'horse','cut','sure','watch','color','face','wood','main','enough','plain','girl','usual','young','ready','above',
  'ever','red','list','though','feel','talk','bird','soon','body','dog','family','direct','pose','leave','song','measure',
  'door','product','black','short','numeral','class','wind','question','happen','complete','ship','area','heart','least',
  'piece','suprise','knew','tall','already','passed','since','whole','build','hour','grew','cents','round','wave','rule',
  'unit','power','town','fine','certain','fly','fall','lead','dark','machine','note','wait','plan','figure','star','box',
  'noun','field','rest','correct','able','pound','done','beauty','drive','stood','contain','front','teach','week','final',
  'gave','green','quick','develop','sleep','warm','free','minute','strong','special','behind','clear','tail','produce',
  'fact','street','inch','lot','nothing','course','stay','wheel','full','force','blue','object','decide','surface','deep',
  'moon','island','foot','yet','busy','test','record','common','gold','possible','five','step','morning','passed','vowel',
  'true','table','south','dollar','war','whether','twelve','rock','tiny','told','copy','wear','final','wait','correct',

  // ─── Animals (real K curriculum) ────────────────────────────────
  'cat','kitten','dog','puppy','cow','calf','horse','pony','sheep','lamb','goat','pig','piglet','duck','duckling',
  'chicken','chick','rooster','hen','rabbit','bunny','mouse','rat','squirrel','bear','tiger','lion','elephant','monkey',
  'giraffe','zebra','panda','penguin','dolphin','whale','shark','octopus','crab','lobster','snake','lizard','turtle','frog',
  'toad','butterfly','bee','spider','ant','worm','snail','bird','eagle','owl','crow','swan','goose','goat','wolf',
  'fox','deer','moose','bison','beaver','rabbit','hamster','goldfish','parrot','hummingbird','peacock','flamingo',
  'puppy','kitten','foal','calf','piglet','lamb','duckling','chick','tadpole','caterpillar','larva','egg','nest','hive',
  'paw','tail','wing','feather','scale','fur','horn','hoof','beak','claw','fin','gill','herbivore','carnivore','omnivore',

  // ─── Plants + nature ────────────────────────────────────────────
  'tree','flower','grass','leaf','leaves','seed','root','stem','branch','bark','fruit','vegetable','plant','garden',
  'forest','jungle','meadow','field','desert','ocean','river','lake','pond','stream','waterfall','mountain','hill','valley',
  'cave','cliff','beach','sand','dirt','soil','rock','stone','pebble','dust','mud','clay',
  'rose','tulip','daisy','sunflower','lily','dandelion','oak','maple','pine','birch','willow','palm','apple','banana',
  'orange','grape','strawberry','blueberry','peach','pear','watermelon','pineapple','lemon','cherry','tomato','potato',
  'carrot','onion','corn','rice','wheat','beans','peas','lettuce','spinach','broccoli','cucumber','pepper','pumpkin',

  // ─── Weather + earth + space ────────────────────────────────────
  'sun','moon','star','planet','earth','sky','cloud','rain','snow','storm','thunder','lightning','tornado','hurricane',
  'wind','breeze','fog','mist','ice','frost','dew','rainbow','shadow','shade','sunshine','sunlight','daytime','nighttime',
  'morning','afternoon','evening','night','today','tomorrow','yesterday','week','weekend','weekday','month','year',
  'spring','summer','autumn','fall','winter','season','hot','cold','warm','cool','wet','dry','sunny','cloudy','rainy',
  'snowy','windy','foggy','stormy','weather','climate','temperature','degree','heat','freeze','melt','boil','steam',
  'volcano','earthquake','flood','drought','wildfire','tide','wave',

  // ─── Body + health ──────────────────────────────────────────────
  'head','hair','face','eye','eyes','nose','ear','ears','mouth','tooth','teeth','tongue','lip','lips','chin','cheek',
  'forehead','neck','shoulder','arm','elbow','wrist','hand','finger','thumb','palm','chest','back','stomach','belly',
  'waist','hip','leg','knee','ankle','foot','toe','heel','skin','bone','muscle','heart','lung','brain','blood','vein',
  'tear','sweat','breath','sleep','awake','sick','healthy','medicine','doctor','nurse','dentist','hospital','clinic',
  'bandage','vitamin','germ','injury','cut','bruise','cough','sneeze','fever',

  // ─── Family + community ─────────────────────────────────────────
  'mom','mother','mommy','dad','father','daddy','parent','baby','child','kid','sister','brother','aunt','uncle','cousin',
  'grandma','grandpa','grandmother','grandfather','grandparent','grandchild','niece','nephew','wife','husband','spouse',
  'family','relative','people','person','adult','teen','teenager','toddler','infant','child','girl','boy','woman','man',
  'friend','neighbor','classmate','teammate','partner','community','town','city','village','country','state','nation',
  'home','house','apartment','building','school','classroom','library','playground','park','store','market','restaurant',
  'hospital','church','firehouse','police','farm','factory','airport','bank','post','office','museum','zoo','aquarium',

  // ─── Jobs + helpers ─────────────────────────────────────────────
  'firefighter','police','officer','doctor','nurse','teacher','farmer','baker','chef','cook','waiter','driver','pilot',
  'astronaut','scientist','engineer','artist','musician','singer','dancer','actor','writer','reader','painter','builder',
  'carpenter','plumber','electrician','mechanic','dentist','vet','veterinarian','librarian','janitor','soldier','sailor',
  'mailman','postman','principal','coach','referee','umpire','judge','lawyer','politician','president','king','queen',
  'prince','princess','knight','wizard','witch','fairy','helper','worker','citizen','volunteer','leader','follower',

  // ─── American symbols + civics ──────────────────────────────────
  'flag','star','stripe','eagle','liberty','freedom','justice','peace','vote','election','rule','law','rights',
  'pledge','allegiance','anthem','statue','monument','holiday','independence','memorial','veterans','thanksgiving',
  'celebration','parade','flag','july','november','february','january','december','september','october','august',
  'march','april','may','june','july',

  // ─── Colors + shapes + art ──────────────────────────────────────
  'red','orange','yellow','green','blue','purple','violet','pink','brown','black','white','gray','grey','silver','gold',
  'bright','dark','light','primary','secondary','warm','cool','rainbow',
  'circle','square','triangle','rectangle','oval','diamond','star','heart','cross','arrow','line','dot','curve',
  'pentagon','hexagon','octagon','sphere','cube','cylinder','cone','pyramid','prism','solid','flat','round',
  'big','small','tall','short','long','wide','narrow','thick','thin','heavy','light','full','empty','soft','hard',
  'smooth','rough','sharp','dull','straight','crooked','open','closed','full','empty','same','different','similar',
  'paint','brush','crayon','marker','pencil','paper','canvas','easel','palette','color','draw','color','sketch',
  'picture','painting','drawing','print','sculpture','clay','pottery','craft','glue','scissors','tape','stapler',

  // ─── Music + sound ──────────────────────────────────────────────
  'music','song','sing','sang','singer','choir','band','orchestra','tune','melody','rhythm','beat','tempo','pulse',
  'note','chord','scale','loud','quiet','soft','noisy','silence','sound','voice','whisper','shout','cry','laugh',
  'piano','guitar','drum','flute','trumpet','violin','cello','saxophone','harp','xylophone','tambourine','triangle',
  'instrument','musical','dance','dancer','clap','tap','stomp','hum','whistle',

  // ─── Time + numbers + calendar ──────────────────────────────────
  'second','minute','hour','day','week','month','year','decade','century','today','yesterday','tomorrow','tonight',
  'morning','afternoon','evening','night','midnight','noon','dawn','dusk','early','late','before','after','during',
  'soon','later','never','always','sometimes','often','rarely','daily','weekly','monthly','yearly',
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday','january','february','march','april','may',
  'june','july','august','september','october','november','december',

  // ─── Emotions + behaviors ───────────────────────────────────────
  'happy','sad','angry','mad','scared','afraid','brave','calm','tired','sleepy','hungry','thirsty','full','sick',
  'excited','bored','surprised','confused','curious','proud','shy','silly','funny','serious','quiet','loud','kind',
  'mean','nice','rude','polite','helpful','lazy','busy','active','smart','clever','wise','foolish','strong','weak',
  'gentle','rough','peaceful','noisy','calm','wild','tame','shy','bold','generous','selfish','honest','dishonest',
  'love','like','hate','want','need','wish','hope','dream','remember','forget','think','know','understand',
  'cry','laugh','smile','frown','yell','scream','whisper','sigh','sneeze','cough','yawn','snore','sneeze',

  // ─── Verbs (common K) ───────────────────────────────────────────
  'go','come','walk','run','jump','hop','skip','swim','fly','crawl','climb','slide','spin','turn','sit','stand',
  'kneel','squat','bend','stretch','reach','grab','hold','carry','lift','push','pull','throw','catch','kick','hit',
  'pat','rub','scratch','tickle','poke','tap','knock','shake','wave','wiggle','jiggle','dance','clap','stomp',
  'eat','drink','chew','swallow','taste','lick','smell','sniff','breathe','blow','suck','spit',
  'see','look','watch','peek','stare','glance','blink','wink','close','open','shut','squint',
  'hear','listen','speak','say','talk','tell','ask','answer','call','shout','whisper','laugh','cry','sing','hum',
  'read','write','draw','paint','color','spell','count','add','subtract','multiply','divide','solve',
  'work','play','sleep','rest','wake','dream','live','die','grow','shrink','start','stop','begin','end','finish',
  'help','hurt','heal','fix','break','build','make','create','destroy','clean','wash','bathe','dress','undress',
  'cook','bake','boil','fry','grill','chill','freeze','heat','melt','mix','stir','pour','spill','drop','catch',
  'find','lose','give','take','share','keep','hide','seek','show','reveal','cover','open','close','lock','unlock',
  'buy','sell','pay','spend','save','earn','count','exchange','trade','give','receive',
  'love','like','hate','want','need','wish','hope','believe','pray','wonder','imagine','remember','forget',

  // ─── Adjectives ─────────────────────────────────────────────────
  'big','small','tall','short','long','wide','narrow','thick','thin','heavy','light','full','empty','soft','hard',
  'smooth','rough','sharp','dull','clean','dirty','wet','dry','hot','cold','warm','cool','old','young','new',
  'fast','slow','quick','easy','hard','simple','complex','same','different','similar','equal','more','less',
  'good','bad','right','wrong','true','false','correct','incorrect','great','terrible','wonderful','awful',
  'pretty','ugly','beautiful','handsome','cute','funny','silly','serious','strange','weird','normal','usual',
  'happy','sad','angry','calm','peaceful','wild','tame','gentle','rough','quiet','loud','noisy','silent',

  // ─── Household + objects ────────────────────────────────────────
  'table','chair','desk','bed','sofa','couch','lamp','rug','carpet','curtain','blanket','pillow','mattress',
  'door','window','wall','floor','ceiling','roof','stair','stairs','elevator','hall','room','bedroom','bathroom',
  'kitchen','livingroom','diningroom','garage','basement','attic','closet','shelf','cabinet','drawer','dresser',
  'plate','bowl','cup','glass','spoon','fork','knife','napkin','tray','pan','pot','kettle','oven','stove',
  'fridge','refrigerator','freezer','microwave','dishwasher','sink','toilet','shower','tub','mirror','soap',
  'brush','comb','toothbrush','towel','clothes','shirt','pants','shorts','skirt','dress','coat','jacket','sweater',
  'shoe','sock','hat','cap','glove','scarf','belt','bag','backpack','purse','wallet','umbrella','watch','clock',

  // ─── Food + meals ───────────────────────────────────────────────
  'food','meal','breakfast','lunch','dinner','snack','dessert','treat','feast','recipe',
  'bread','toast','sandwich','roll','bagel','pancake','waffle','cereal','oatmeal',
  'milk','water','juice','soda','tea','coffee','cocoa','smoothie','soup',
  'cheese','butter','jam','jelly','peanut','honey','sugar','salt','pepper','spice',
  'meat','beef','pork','chicken','fish','egg','bacon','sausage','hotdog','hamburger',
  'apple','banana','orange','grape','berry','cherry','peach','pear','melon','watermelon','pineapple','mango',
  'cake','cookie','candy','chocolate','icecream','pie','pudding','muffin','donut','popcorn',

  // ─── Transportation + travel ────────────────────────────────────
  'car','truck','bus','van','taxi','bike','bicycle','tricycle','scooter','skateboard','wagon','cart',
  'train','subway','tram','rocket','airplane','plane','jet','helicopter','spaceship','spaceshuttle',
  'boat','ship','canoe','kayak','submarine','sailboat','yacht','motorboat',
  'wheel','tire','engine','motor','propeller','wing','sail','anchor','steering','brake','gas','fuel',
  'road','street','highway','sidewalk','bridge','tunnel','railroad','runway','dock','harbor','airport','station',

  // ─── School + learning ──────────────────────────────────────────
  'school','class','classroom','student','teacher','principal','desk','chair','board','chalk','marker','eraser',
  'book','notebook','paper','pencil','pen','crayon','ruler','scissors','glue','tape','stapler','folder','binder',
  'backpack','lunchbox','homework','test','quiz','grade','report','lesson','subject','english','math','science',
  'reading','writing','spelling','phonics','arithmetic','history','geography','art','music','gym','recess',
  'library','book','story','novel','poem','rhyme','letter','word','sentence','paragraph','page','chapter',
  'alphabet','vowel','consonant','syllable','sound','spelling','phonics','sight','reading','writing','printing',

  // ─── Toys + games + activities ──────────────────────────────────
  'toy','ball','doll','teddy','bear','blocks','puzzle','game','board','cards','dice','marbles','jacks','jumprope',
  'kite','frisbee','swing','slide','seesaw','swingset','sandbox','bucket','shovel','rake','tractor',
  'tag','hide','seek','catch','keepaway','hopscotch','foursquare','dodgeball','kickball','tetherball',
  'soccer','baseball','basketball','football','tennis','golf','hockey','volleyball','swim','ride','race',
  'play','game','win','lose','tie','draw','team','player','score','goal','point','fair','foul','rule',

  // ─── Holidays + celebrations ────────────────────────────────────
  'birthday','party','celebration','holiday','christmas','easter','halloween','thanksgiving','newyear','valentine',
  'fourth','july','independence','memorialday','presidentsday','laborday','mlk','easter','passover','hanukkah',
  'kwanzaa','ramadan','diwali','chinesenewyear','present','gift','candle','cake','candy','costume','mask','treat',
  'firework','parade','dance','feast','prayer','tradition','custom',

  // ─── Prepositions + connectors ──────────────────────────────────
  'in','on','at','by','to','from','of','for','with','without','into','onto','upon','about','around','through',
  'over','under','above','below','between','among','beside','behind','before','after','during','since','until',
  'and','or','but','so','if','because','although','though','while','when','where','why','how','what','who',
  'this','that','these','those','here','there','now','then','today','tonight','yesterday','tomorrow',

  // ─── More body / health detail ──────────────────────────────────
  'spine','rib','liver','kidney','stomach','intestine','bladder','nerve','tendon','joint','vein','artery','pulse',
  'cough','sneeze','itch','scratch','rash','wound','scab','scar','bruise','swelling','pain','ache','headache',
  'toothache','stomachache','earache','dizzy','nauseous','vomit','pregnant','newborn','elderly','wrinkle','grayhair',

  // ─── More animals (deep coverage) ───────────────────────────────
  'cat','kitten','dog','puppy','pony','lamb','foal','calf','piglet','duckling','tadpole','larva','caterpillar','cocoon',
  'lion','tiger','leopard','cheetah','jaguar','panther','wolf','coyote','fox','hyena','bear','grizzly','polar','panda',
  'monkey','ape','gorilla','chimp','baboon','lemur','sloth','koala','kangaroo','wombat','platypus','echidna','possum',
  'horse','donkey','mule','zebra','camel','llama','alpaca','buffalo','bison','rhino','hippo','elephant','giraffe',
  'eagle','hawk','falcon','vulture','owl','crow','raven','dove','pigeon','sparrow','robin','cardinal','bluejay',
  'flamingo','peacock','toucan','parrot','cockatoo','canary','penguin','ostrich','emu','swan','goose','duck',
  'shark','whale','dolphin','seal','walrus','octopus','squid','jellyfish','starfish','crab','lobster','shrimp',
  'snake','viper','cobra','rattlesnake','python','boa','lizard','gecko','iguana','chameleon','dragonfly','firefly',
  'mosquito','fly','flea','tick','louse','wasp','hornet','beetle','ladybug','grasshopper','cricket','mantis','moth',

  // ─── More plants / botany ───────────────────────────────────────
  'sapling','sprout','bud','blossom','petal','pistil','stamen','pollen','nectar','spore','fern','moss','lichen','algae',
  'cactus','bamboo','vine','ivy','clover','dandelion','sunflower','daisy','rose','lily','orchid','poppy','iris',
  'marigold','lavender','jasmine','geranium','begonia','tulip','daffodil','lilac','magnolia','dogwood','redwood',
  'cedar','spruce','fir','elm','beech','aspen','birch','willow','maple','oak','ash','hickory','walnut','cherry',
  'orchard','grove','plantation','greenhouse','nursery','farm','farmer','farmland','field','crop','harvest',

  // ─── Geography + landforms ──────────────────────────────────────
  //second pass — pushback on over-aggressive
  // removal. K-graders DO know continent/equator/arctic/poles/peak/
  // plateau/canyon/peninsula/prairie/tundra/wetland/grassland —
  // these are common picture-book + basic-K-science words. Only
  // truly G3+ terms removed (isthmus / fjord / atoll / lagoon /
  // tributary / meridian / latitude / longitude / hemisphere / cape
  // / strait / gorge / county / province / territory / district /
  // tropic / antarctic).
  'continent','country','state','city','town','village','region','map','globe',
  'north','south','east','west','direction','compass','equator','arctic','pole',
  'mountain','peak','hill','cliff','valley','plain','beach','plateau','canyon','crater','basin','horizon',
  'island','peninsula','bay','gulf','channel','sound','reef',
  'river','stream','creek','brook','waterfall','dam','lake','pond','marsh','swamp','wetland',
  'desert','savanna','prairie','tundra','forest','jungle','rainforest','woodland','grassland','meadow','field',

  // ─── Weather + earth science ────────────────────────────────────
  'humid','dry','arid','rainfall','snowfall','blizzard','hailstorm','sleet','flurry','drizzle','downpour','shower',
  'temperature','celsius','fahrenheit','degrees','wind','gust','breeze','gale','storm','cyclone','typhoon','monsoon',
  'season','spring','summer','autumn','winter','solstice','equinox','climate','greenhouse','atmosphere','ozone',
  'volcano','lava','magma','eruption','earthquake','tremor','fault','plate','tectonic','tsunami','tide','current',
  //second pass — picture-book minerals K-graders know
  // (crystal/diamond/ruby/emerald/sapphire/pearl/marble/granite)
  // restored. Only truly G3+ (alloy/ore/obsidian/sandstone/quartz/
  // amber/limestone/aluminum) removed.
  'mineral','crystal','diamond','ruby','emerald','sapphire','pearl','marble','granite',
  'iron','copper','silver','gold','lead','tin','steel','metal',

  // ─── Solar system + space ───────────────────────────────────────
  //second pass — operator pushback. K-graders DO know
  // these from space picture books / cartoons / basic K science:
  // galaxy, universe, milkyway, atmosphere, northernlights, satellite,
  // spacestation, gravity, blackhole. Restored. Only truly above-K
  // terms (cosmos / nebula / observatory / weightless / vacuum /
  // ozone / radiation / aurora / meteorite) stay removed.
  'sun','moon','planet','mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto','asteroid',
  'comet','meteor','galaxy','milkyway','universe','blackhole','solarsystem','orbit',
  'satellite','rocket','astronaut','spaceship','spacestation','telescope','crater','eclipse',
  'lunar','solar','gravity','space','atmosphere','northernlights',

  // ─── Common verbs (additional) ──────────────────────────────────
  'arrive','depart','enter','exit','meet','greet','introduce','welcome','farewell','goodbye','hello','hi',
  'agree','disagree','accept','refuse','allow','forbid','permit','deny','approve','reject',
  'visit','return','depart','journey','travel','tour','explore','discover','search','seek','find','lose','locate',
  'invent','create','design','build','construct','demolish','destroy','repair','replace','restore','renovate',
  'plant','grow','water','feed','care','nurture','raise','train','teach','guide','lead','direct','instruct',
  'protect','guard','defend','attack','fight','battle','conquer','surrender','win','lose','retreat','escape',
  'rescue','save','help','aid','assist','support','encourage','comfort','console','soothe','calm',
  'bark','meow','moo','baa','oink','quack','chirp','tweet','roar','growl','hiss','purr','howl','neigh','bray',
  'cluck','crow','hoot','coo','squeak','buzz','squawk','snort','snore','splash','crash','bang','clang','ring',

  // ─── Adjectives / descriptors (additional) ──────────────────────
  'huge','tiny','enormous','massive','gigantic','minute','minuscule','vast','immense','colossal',
  'beautiful','gorgeous','stunning','lovely','adorable','attractive','plain','homely','hideous',
  'bright','shiny','glossy','matte','dull','vivid','pale','vibrant','fluorescent','transparent','opaque',
  'fragrant','aromatic','sweet','sour','bitter','salty','spicy','tangy','bland','tasty','delicious','disgusting',
  'noisy','quiet','silent','loud','soft','still','peaceful','chaotic','calm','wild','tame','gentle','rough',
  'curious','interested','bored','excited','enthusiastic','indifferent','passionate','apathetic','eager','reluctant',
  'generous','stingy','greedy','thrifty','frugal','wasteful','careful','careless','attentive','distracted','focused',
  'patient','impatient','tolerant','intolerant','flexible','rigid','adaptable','stubborn','willing','unwilling',
  'cheerful','gloomy','optimistic','pessimistic','positive','negative','hopeful','hopeless','confident','timid',

  // ─── Time / sequence ────────────────────────────────────────────
  'beginning','middle','end','start','finish','complete','partial','almost','nearly','barely','scarcely',
  'frequently','occasionally','seldom','always','never','ever','sometimes','momentarily','instantly','immediately',
  'eventually','ultimately','finally','suddenly','abruptly','gradually','slowly','quickly','speedy','rapid','sluggish',
  'recent','current','present','past','future','ancient','modern','historic','prehistoric','antique','vintage',

  // ─── Math (additional concepts) ─────────────────────────────────
  'addition','subtraction','multiplication','division','equation','formula','calculation','computation','arithmetic',
  'fraction','decimal','percent','percentage','ratio','proportion','average','median','mean','total','quantity',
  'measure','measurement','scale','weight','length','width','height','depth','volume','area','perimeter','diameter',
  'inch','foot','yard','mile','centimeter','meter','kilometer','ounce','pound','ton','gram','kilogram',
  'cup','pint','quart','gallon','liter','milliliter','teaspoon','tablespoon',
  'horizontal','vertical','diagonal','parallel','perpendicular','curved','straight','angle','degree','corner',
  'symmetry','pattern','sequence','series','order','arrangement','matrix','grid','chart','graph','table',

  // ─── Computer / tech (modern K) ─────────────────────────────────
  'computer','laptop','tablet','phone','smartphone','screen','keyboard','mouse','speaker','headphone','camera',
  'internet','website','email','message','text','chat','app','program','software','hardware','battery','cable',
  'video','game','movie','show','channel','program','stream','download','upload','install','update','restart',

  // ─── Money / commerce ──────────────────────────────────────────
  'money','dollar','cent','penny','nickel','dime','quarter','coin','bill','cash','check','card','credit','debit',
  'price','cost','value','worth','expensive','cheap','free','sale','discount','bargain','tax','tip','wage','salary',
  'buy','purchase','sell','trade','exchange','spend','save','earn','lose','win','rich','poor','wealthy','broke',
  'shop','store','market','mall','supermarket','grocery','bakery','butcher','pharmacy','bookstore','toystore',

  // ─── Communication ──────────────────────────────────────────────
  'language','english','spanish','french','german','chinese','japanese','arabic','word','phrase','sentence','paragraph',
  'speak','speech','speak','say','tell','talk','speak','converse','discuss','chat','gossip','whisper','shout','yell',
  'hear','listen','sound','volume','silence','noise','echo','translate','interpret',
  'write','print','type','sign','signal','gesture','wave','nod','shake','point','clap','snap',

  // ─── Travel + exploration ───────────────────────────────────────
  'visit','vacation','trip','journey','adventure','quest','expedition','voyage','tour','cruise','flight','drive',
  'arrive','depart','board','disembark','passport','ticket','luggage','suitcase','backpack','map','compass','itinerary',
  'hotel','motel','resort','camp','tent','cabin','lodge','inn','hostel','airbnb',

  // ─── Misc concepts kindergartners learn ─────────────────────────
  'truth','lie','honesty','dishonesty','fairness','unfairness','kindness','meanness','respect','disrespect',
  'safety','danger','risk','accident','emergency','help','rescue','protect','careful','cautious','reckless','rash',
  'happiness','sadness','anger','fear','love','hate','envy','jealousy','pride','shame','guilt','regret','remorse',
  'thought','idea','memory','imagination','creativity','invention','discovery','solution','answer','question',
  'reason','cause','effect','result','outcome','consequence','reaction','response','reply','feedback',
  'beginning','middle','end','start','finish','process','step','stage','phase','period','era','age',
  'rule','law','order','chaos','peace','war','conflict','disagreement','argument','discussion','debate','negotiation',
  'success','failure','victory','defeat','triumph','catastrophe','disaster','accident','luck','fortune','misfortune',
];

// Dedup + lowercase + filter to 3+ char content words for definition
// teach (single letters get definitions too but via separate path).
function _buildVocabulary(raw) {
  const seen = new Set();
  const out = [];
  for (const w of raw) {
    const lw = String(w || '').toLowerCase().trim();
    if (!lw) continue;
    if (!/^[a-z][a-z'-]*$/.test(lw)) continue;
    if (seen.has(lw)) continue;
    seen.add(lw);
    out.push(lw);
  }
  return out;
}

export const K_VOCABULARY = _buildVocabulary(K_VOCABULARY_RAW);
export const K_VOCABULARY_SIZE = K_VOCABULARY.length;
