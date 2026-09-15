# Publish Mobile HTML Preview console errors

After a `npm run build` and `npm run preview` 
- Lucide Icons are not rendered
- elements background images are not rendered
- still "Get a free account.Forever&nbsp;" as a placeholder in a new flexbox

in browse console errors:

```
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <nav id=​"whoobe-qdltl" class=​"flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</nav>​
overrideMethod @ installHook.js:1
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <nav id=​"whoobe-qdltl" class=​"flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</nav>​
overrideMethod @ installHook.js:1
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <flex id=​"whoobe-jemo3" class=​"w-full shadow-md bg-slate-700/​80 mt-2 flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</flex>​
overrideMethod @ installHook.js:1
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <flex id=​"whoobe-jemo3" class=​"w-full shadow-md bg-slate-700/​80 mt-2 flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</flex>​
overrideMethod @ installHook.js:1
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu"

 <nav id=​"whoobe-qdltl" class=​"flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</nav>​
overrideMethod @ installHook.js:1
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu"

 <flex id=​"whoobe-jemo3" class=​"w-full shadow-md bg-slate-700/​80 mt-2 flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</flex>​
overrideMethod @ installHook.js:1
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu (eval at <anonymous> (index-CaPqi9oY.js:21:749), <anonymous>:3:32)
    at index-CaPqi9oY.js:21:1165
    at qd (index-CaPqi9oY.js:17:12528)
    at Wr.fn (index-CaPqi9oY.js:21:44887)
    at Wr.run (index-CaPqi9oY.js:21:20665)
    at rh (index-CaPqi9oY.js:21:22825)
    at Object.effect (index-CaPqi9oY.js:21:48873)
    at tn (index-CaPqi9oY.js:17:7375)
    at index-CaPqi9oY.js:17:7550
    at Function.<anonymous> (index-CaPqi9oY.js:21:44881)
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu (eval at <anonymous> (index-CaPqi9oY.js:21:749), <anonymous>:3:32)
    at index-CaPqi9oY.js:21:1165
    at qd (index-CaPqi9oY.js:17:12528)
    at Wr.fn (index-CaPqi9oY.js:21:44887)
    at Wr.run (index-CaPqi9oY.js:21:20665)
    at rh (index-CaPqi9oY.js:21:22825)
    at Object.effect (index-CaPqi9oY.js:21:48873)
    at tn (index-CaPqi9oY.js:17:7375)
    at index-CaPqi9oY.js:17:7550
    at Function.<anonymous> (index-CaPqi9oY.js:21:44881)
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu = !appMenu;
appPage = !appPage;"

 <lucideicon id=​"whoobe-jaz9h" class=​"w-8 h-8 bg-violet-200 p-2 rounded-lg text-violet-700 hover:​bg-violet-700 hover:​text-violet-200 absolute right-2 top-2 z-[10000]​" x-on:click=​"appMenu = !appMenu;​
appPage = !appPage;​">​…​</lucideicon>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu = !appMenu;
appPage = !appPage; (eval at <anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:749), <anonymous>:3:43)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:1165
    at qd (http://localhost:4173/assets/index-CaPqi9oY.js:17:12528)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:48434
    at s (http://localhost:4173/assets/index-CaPqi9oY.js:21:35831)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:36715
    at HTMLUnknownElement.<anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:35853)
[Alpine] appMenu = !appMenu;
appPage = !appPage; @ VM20:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <nav id=​"whoobe-qdltl" class=​"flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</nav>​
overrideMethod @ installHook.js:1
lt @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <nav id=​"whoobe-qdltl" class=​"flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</nav>​
overrideMethod @ installHook.js:1
lt @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <flex id=​"whoobe-jemo3" class=​"w-full shadow-md bg-slate-700/​80 mt-2 flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</flex>​
overrideMethod @ installHook.js:1
lt @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Warning: You can't use [x-collapse] without first installing the "Collapse" plugin here: https://alpinejs.dev/plugins/collapse <flex id=​"whoobe-jemo3" class=​"w-full shadow-md bg-slate-700/​80 mt-2 flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</flex>​
overrideMethod @ installHook.js:1
lt @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu"

 <nav id=​"whoobe-qdltl" class=​"flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</nav>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
run @ index-CaPqi9oY.js:21
rh @ index-CaPqi9oY.js:21
effect @ index-CaPqi9oY.js:21
tn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu"

 <flex id=​"whoobe-jemo3" class=​"w-full shadow-md bg-slate-700/​80 mt-2 flex flex-col" x-show=​"appMenu" x-collapse x-collapse.duration.500ms=​"500ms" style=​"display:​ none;​">​…​</flex>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
run @ index-CaPqi9oY.js:21
rh @ index-CaPqi9oY.js:21
effect @ index-CaPqi9oY.js:21
tn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Expression Error: appPage is not defined

Expression: "!appPage"

 <hero id=​"whoobe-i36vf" class=​"gap-2 mb-1 lg:​mb-2 w-full m-auto h-screen bg-orange-300 flex flex-col" x-show=​"!appPage" style=​"display:​ none;​">​…​</hero>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
run @ index-CaPqi9oY.js:21
rh @ index-CaPqi9oY.js:21
effect @ index-CaPqi9oY.js:21
tn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu (eval at <anonymous> (index-CaPqi9oY.js:21:749), <anonymous>:3:32)
    at index-CaPqi9oY.js:21:1165
    at qd (index-CaPqi9oY.js:17:12528)
    at Wr.fn (index-CaPqi9oY.js:21:44887)
    at Wr.run (index-CaPqi9oY.js:21:20665)
    at rh (index-CaPqi9oY.js:21:22825)
    at Object.effect (index-CaPqi9oY.js:21:48873)
    at tn (index-CaPqi9oY.js:17:7375)
    at index-CaPqi9oY.js:17:7550
    at Function.<anonymous> (index-CaPqi9oY.js:21:44881)
[Alpine] appMenu @ VM21:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
run @ index-CaPqi9oY.js:21
rh @ index-CaPqi9oY.js:21
effect @ index-CaPqi9oY.js:21
tn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu (eval at <anonymous> (index-CaPqi9oY.js:21:749), <anonymous>:3:32)
    at index-CaPqi9oY.js:21:1165
    at qd (index-CaPqi9oY.js:17:12528)
    at Wr.fn (index-CaPqi9oY.js:21:44887)
    at Wr.run (index-CaPqi9oY.js:21:20665)
    at rh (index-CaPqi9oY.js:21:22825)
    at Object.effect (index-CaPqi9oY.js:21:48873)
    at tn (index-CaPqi9oY.js:17:7375)
    at index-CaPqi9oY.js:17:7550
    at Function.<anonymous> (index-CaPqi9oY.js:21:44881)
[Alpine] appMenu @ VM21:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
run @ index-CaPqi9oY.js:21
rh @ index-CaPqi9oY.js:21
effect @ index-CaPqi9oY.js:21
tn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
index-CaPqi9oY.js:21 Uncaught ReferenceError: appPage is not defined
    at [Alpine] !appPage (eval at <anonymous> (index-CaPqi9oY.js:21:749), <anonymous>:3:33)
    at index-CaPqi9oY.js:21:1165
    at qd (index-CaPqi9oY.js:17:12528)
    at Wr.fn (index-CaPqi9oY.js:21:44887)
    at Wr.run (index-CaPqi9oY.js:21:20665)
    at rh (index-CaPqi9oY.js:21:22825)
    at Object.effect (index-CaPqi9oY.js:21:48873)
    at tn (index-CaPqi9oY.js:17:7375)
    at index-CaPqi9oY.js:17:7550
    at Function.<anonymous> (index-CaPqi9oY.js:21:44881)
[Alpine] !appPage @ VM125:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
run @ index-CaPqi9oY.js:21
rh @ index-CaPqi9oY.js:21
effect @ index-CaPqi9oY.js:21
tn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
n @ index-CaPqi9oY.js:21
l @ index-CaPqi9oY.js:21
ip @ index-CaPqi9oY.js:21
it @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:17
si @ index-CaPqi9oY.js:17
childList
gn.immediate @ index-CaPqi9oY.js:47
fl @ index-CaPqi9oY.js:13
He @ index-CaPqi9oY.js:13
Uo.o.call @ index-CaPqi9oY.js:13
N @ index-CaPqi9oY.js:9
gr @ index-CaPqi9oY.js:13
z @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
ln @ index-CaPqi9oY.js:13
We @ index-CaPqi9oY.js:13
y @ index-CaPqi9oY.js:13
E @ index-CaPqi9oY.js:13
run @ index-CaPqi9oY.js:9
runIfDirty @ index-CaPqi9oY.js:9
fl @ index-CaPqi9oY.js:13
Ho @ index-CaPqi9oY.js:13
Promise.then
Lo @ index-CaPqi9oY.js:13
Wc @ index-CaPqi9oY.js:13
Nf @ index-CaPqi9oY.js:13
Uo.o.scheduler @ index-CaPqi9oY.js:13
Fc.c.scheduler @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
xs @ index-CaPqi9oY.js:9
notify @ index-CaPqi9oY.js:9
trigger @ index-CaPqi9oY.js:9
set value @ index-CaPqi9oY.js:9
Tt @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
Promise.then
(anonymous) @ index-CaPqi9oY.js:44
(anonymous) @ index-CaPqi9oY.js:44
o @ index-CaPqi9oY.js:44
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu = !appMenu;
appPage = !appPage;"

 <lucideicon id=​"whoobe-jaz9h" class=​"w-8 h-8 bg-violet-200 p-2 rounded-lg text-violet-700 hover:​bg-violet-700 hover:​text-violet-200 absolute right-2 top-2 z-[10000]​" x-on:click=​"appMenu = !appMenu;​
appPage = !appPage;​">​…​</lucideicon>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu = !appMenu;
appPage = !appPage; (eval at <anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:749), <anonymous>:3:43)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:1165
    at qd (http://localhost:4173/assets/index-CaPqi9oY.js:17:12528)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:48434
    at s (http://localhost:4173/assets/index-CaPqi9oY.js:21:35831)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:36715
    at HTMLUnknownElement.<anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:35853)
[Alpine] appMenu = !appMenu;
appPage = !appPage; @ VM20:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu = !appMenu;
appPage = !appPage;"

 <lucideicon id=​"whoobe-jaz9h" class=​"w-8 h-8 bg-violet-200 p-2 rounded-lg text-violet-700 hover:​bg-violet-700 hover:​text-violet-200 absolute right-2 top-2 z-[10000]​" x-on:click=​"appMenu = !appMenu;​
appPage = !appPage;​">​…​</lucideicon>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu = !appMenu;
appPage = !appPage; (eval at <anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:749), <anonymous>:3:43)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:1165
    at qd (http://localhost:4173/assets/index-CaPqi9oY.js:17:12528)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:48434
    at s (http://localhost:4173/assets/index-CaPqi9oY.js:21:35831)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:36715
    at HTMLUnknownElement.<anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:35853)
[Alpine] appMenu = !appMenu;
appPage = !appPage; @ VM20:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu = !appMenu;
appPage = !appPage;"

 <lucideicon id=​"whoobe-jaz9h" class=​"w-8 h-8 bg-violet-200 p-2 rounded-lg text-violet-700 hover:​bg-violet-700 hover:​text-violet-200 absolute right-2 top-2 z-[10000]​" x-on:click=​"appMenu = !appMenu;​
appPage = !appPage;​">​…​</lucideicon>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu = !appMenu;
appPage = !appPage; (eval at <anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:749), <anonymous>:3:43)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:1165
    at qd (http://localhost:4173/assets/index-CaPqi9oY.js:17:12528)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:48434
    at s (http://localhost:4173/assets/index-CaPqi9oY.js:21:35831)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:36715
    at HTMLUnknownElement.<anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:35853)
[Alpine] appMenu = !appMenu;
appPage = !appPage; @ VM20:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
installHook.js:1 Alpine Expression Error: appMenu is not defined

Expression: "appMenu = !appMenu;
appPage = !appPage;"

 <lucideicon id=​"whoobe-jaz9h" class=​"w-8 h-8 bg-violet-200 p-2 rounded-lg text-violet-700 hover:​bg-violet-700 hover:​text-violet-200 absolute right-2 top-2 z-[10000]​" x-on:click=​"appMenu = !appMenu;​
appPage = !appPage;​">​…​</lucideicon>​
overrideMethod @ installHook.js:1
Gd @ index-CaPqi9oY.js:17
wn @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
Promise.catch
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
index-CaPqi9oY.js:21 Uncaught ReferenceError: appMenu is not defined
    at [Alpine] appMenu = !appMenu;
appPage = !appPage; (eval at <anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:749), <anonymous>:3:43)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:1165
    at qd (http://localhost:4173/assets/index-CaPqi9oY.js:17:12528)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:48434
    at s (http://localhost:4173/assets/index-CaPqi9oY.js:21:35831)
    at http://localhost:4173/assets/index-CaPqi9oY.js:21:36715
    at HTMLUnknownElement.<anonymous> (http://localhost:4173/assets/index-CaPqi9oY.js:21:35853)
[Alpine] appMenu = !appMenu;
appPage = !appPage; @ VM20:3
(anonymous) @ index-CaPqi9oY.js:21
qd @ index-CaPqi9oY.js:17
(anonymous) @ index-CaPqi9oY.js:21
s @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
(anonymous) @ index-CaPqi9oY.js:21
```