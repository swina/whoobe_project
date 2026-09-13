"use strict";

export default class Element {

    constructor(){
        this.id = this.randomID()
        this.blocks = []
        this.css = {
            css: "" ,
            container: "" 
        }
        this.tailwind = {}
        this.font = ""
        this.style = ""
        this.content = ""
        this.description = ""
        this.categories = []
        this.alpine = {}
        this.events = {
            display: null,
            hide: null,
            mouseenter: null,
            mouseleave: null,
            click: null,
            focus: null,
            blur: null,
            keydown: null
        }
        this.data = {}
        this.gsap = {
            animation: null,
            ease: null,
            duration: 0,
            delay:0
        }
        this.link = ''
        this.anchor = ''
        this.image = {
            url: null
        }
        this.type = 'element'
        this.tag = 'element'
        this.editable = false
        this.icon = 'highlight_alt'
        this.helper = null
        this.dialog = null
        this.dataBinding = null
        this.name = ''
    }

    randomID(){
        return 'whoobe-' + Math.random().toString(36).substr(2, 5)
    }

    Groups(){
        return [ 
            {
                label: 'containers'  , 
                elements: [ 
                    {
                        name: 'Grid',
                        icon: 'grid_on' 
                    }, 
                    {
                        name: 'Flexbox' ,
                        icon: 'highlight_alt'
                    },
                    {
                        name: 'Dropdown Menu',
                        icon: 'arrow_drop_down_circle'
                    }
                ],
            } ,
            { 
                label:'text',
                elements: [ 
                    { 
                        name: 'Heading' ,
                        icon: 'title' ,
                    }, 
                    {
                        name: 'Paragraph',
                        icon: 'subject' 
                    },
                    { 
                        name: 'Inline Text',
                        icon: 'text_format'
                    }, 
                    {
                        name: 'Span',
                        icon: 'text_format'
                    },
                    {
                        name: 'Blockquote',
                        icon: 'text_format'
                    },
                    {
                        name: 'Code',
                        icon: 'code'
                    }

                ]
            },
            {
                label: 'media',
                elements: [ 
                    {
                        name: 'Image' ,
                        icon: 'insert_photo' 
                    }, 
                    {
                        name: 'Slider' ,
                        icon: 'video_library' 
                    },
                    { 
                        name: 'Video',
                        icon: 'movie'
                    },
                    { 
                        name: 'Youtube',
                        icon: 'movie' 
                    }, 
                    {
                        name: 'Vimeo',
                        icon: 'movie' 
                    },
                    {
                        name: 'LucideIcon',
                        icon: 'crop_original'
                    },
                    {
                        name: 'Download',
                        icon: 'download'
                    }
                ]
            },
            {
                label: 'form',
                elements: [ 
                    {
                        name: 'Form' ,
                        icon: 'call_to_action' 
                    }, 
                    { 
                        name: 'Input Text',
                        icon: 'input'
                    },
                    { 
                        name: 'Email',
                        icon: 'email' 
                    }, 
                    // {
                    //     name: 'Hidden',
                    //     icon: 'input' 
                    // },
                    {
                        name: 'Number',
                        icon: 'input'
                    },
                    {
                        name: 'Checkbox',
                        icon: 'check_box'
                    },
                    {
                        name: 'Radio Group',
                        icon: 'radio_button_checked'
                    },
                    {
                        name: 'Textarea',
                        icon: 'text_format'
                    },
                    {
                        name: 'Select',
                        icon: 'input'
                    },
                    {
                        name: 'Submit',
                        icon: 'smart_button'
                    },
                    {
                        name: 'Reset',
                        icon: 'smart_button'
                    },
                    {
                        name: 'Button',
                        icon: 'smart_button'
                    }
                ]
            },
            {
                label: 'search',
                elements: [
                    {
                        name: 'Search',
                        icon: 'search'
                    }
                ]
            },
            {
                label: 'navigation',
                elements: [
                    {
                        name: 'Bottom Navigation',
                        icon: 'smartphone'
                    }
                ]
            }
        ]
    }

    
    createElement(element,options){
        return element === 'Grid'       ? this.Grid(options) :
            element === 'Flexbox'       ? this.Flexbox(options) :
            element === 'Dropdown Menu' ? this.DropdownMenu() :
            element === 'Heading'       ? this.Heading(options) : 
            element === 'Paragraph'     ? this.Paragraph() :
            element === 'Inline Text'   ? this.InlineText() :
            element === 'Span'          ? this.Span() :
            element === 'Blockquote'    ? this.Blockquote() :
            element === 'Code'          ? this.Code() :
            element === 'Image'         ? this.Image() :
            element === 'Slider'        ? this.Slider() :
            element === 'Video'         ? this.Video() :
            element === 'Youtube'       ? this.YTVideo() :
            element === 'Vimeo'         ? this.VimeoVideo() :
            element === 'LucideIcon'    ? this.LucideIcon() :
            element === 'Download'      ? this.Download() :
            element === 'Form'          ? this.Form() :
            element === 'Input Text'    ? this.InputText() :
            element === 'Email'         ? this.InputEmail() :
            element === 'Textarea'      ? this.InputTextarea() :
            element === 'Checkbox'      ? this.InputCheckbox() :
            element === 'Radio Group'   ? this.RadioGroup() :
            element === 'Number'        ? this.InputNumber() :
            element === 'Hidden'        ? this.InputHidden() :
            element === 'Select'        ? this.InputSelect() :
            element === 'Submit'        ? this.InputSubmit() :
            element === 'Reset'         ? this.InputReset() :
            element === 'Button'        ? this.Button() :
            element === 'Search'        ? this.Search() :
            element === 'Bottom Navigation' ? this.BottomNavigation() : null
    }

    setIcon(icon){
        this.icon = icon
        return this
    }

    setTag(tag){
        this.tag = tag
        return this
    }

    setCss(css){
        this.css.css = css
        return this
    }

    setContent(content){
        this.content = content
        return this
    }
    
    setImage(image){
        this.image = image
        return this
    }

    setSemantic(semantic){
        this.semantic = semantic
        return this
    }

    setDataBinding(dataBinding){
        this.dataBinding = dataBinding
        return this
    }

    

    Grid(){
        this.blocks = []
        this.type = 'container'
        this.tag = 'grid'
        this.css.container = 'md:grid flex flex-col'
        this.element = 'div'
        this.helper = 'blocks/helpers/Grid.vue'
        this.dialog = 'md:w-1/3'
        return this
    }



    Cols(cols=1){
        this.css.container += ' md:grid-cols-' + cols
        // for ( let n=0; n < cols ; n++){
        //     this.blocks.push ( new Element().Flexbox() )
        // }       
        return this
    }

    Flexbox(options={direction:null,colspan:null}){
        this.blocks = []
        this.type = 'container'
        this.tag = 'flex'
        this.css.container = 'flex' 
        this.css.container += options.direction ? ' flex-' + options.direction : '' 
        this.css.container += options.colspan ? ' col-span-' + options.colspan : ''
        this.element = 'div'
        return this
    }

    // Not a port - a composite preset (root + trigger + panel + children),
    // unlike every other createElement() builder here which only ever
    // configures the single node it's called on. Built from three plain
    // Flexbox()/Span()/Button() nodes assembled by hand rather than reusing
    // `new Element()...` chains, since each child needs its own independent
    // `alpine`/`css`/`semantic` set after construction - a burger trigger
    // (`x-on:click="open = !open"`, 3 bar Spans, re-tagged <button> via
    // setSemantic() since a container's rendered tag comes from `semantic`,
    // never `element` - see BlockContainerPreview.vue/BlockContainer.vue's
    // own `semantic || 'div'` computed) and a dropdown panel
    // (`x-show`/`x-transition`/`x-on:click.outside`, absolutely positioned,
    // holding 3 Button menu items). An empty `x-transition` value is
    // deliberate, not an oversight: Alpine's `x-transition` directive
    // crashes (`directiveStorageMap[stage] is not a function`) if given a
    // class-string value with no `:enter`/`:leave` stage suffix - empty
    // routes through its own default fade+scale instead.
    DropdownMenu(){
        this.Flexbox()
        this.css.container = 'relative inline-block'
        this.label = 'Dropdown Menu'
        this.alpine = { 'x-data': '{ open: false }' }

        const bar = () => {
            const b = new Element().Span()
            b.content = ''
            b.css.css = 'block w-6 h-0.5 bg-gray-800 rounded'
            return b
        }
        const menuItem = (label) => {
            const btn = new Element().Button()
            btn.content = label
            btn.value = label
            btn.css.css = 'block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100'
            return btn
        }

        const trigger = new Element().Flexbox({ direction: 'col' })
        trigger.setSemantic('button')
        trigger.tag = 'button'
        trigger.label = 'Burger Trigger'
        trigger.css.container = 'flex flex-col justify-center items-center gap-1.5 w-10 h-10 rounded hover:bg-gray-100'
        trigger.alpine = { 'x-on:click': 'open = !open' }
        trigger.blocks = [ bar(), bar(), bar() ]

        const panel = new Element().Flexbox({ direction: 'col' })
        panel.label = 'Dropdown Panel'
        panel.css.container = 'absolute right-0 mt-2 w-48 flex flex-col rounded-md shadow-lg bg-white ring-1 ring-black/5 z-20 py-1'
        panel.alpine = {
            'x-show': 'open',
            'x-transition': '',
            'x-on:click.outside': 'open = false',
        }
        panel.blocks = [ menuItem('Profile'), menuItem('Settings'), menuItem('Sign out') ]

        this.blocks = [ trigger, panel ]
        return this
    }

    // Not a byte-for-byte port from here down - a full, deliberate redesign
    // of Slider(), explicitly requested (the source's own version never
    // worked in this port: `type: 'slider'` and `element: 'slider'` don't
    // match anything BlockContainer.vue's/BlockElement.vue's dispatch
    // logic recognizes, so a dropped Slider silently rendered as a bare,
    // meaningless `<slider>` tag with no actual carousel behavior at all -
    // not a small, fixable bug, a fundamentally different, never-finished
    // design). Now: `type: 'container'` and a real `tag: 'slider'` (was
    // 'flex', colliding with Flexbox's own tag) - a slider's slides are
    // just its `.blocks`, exactly like any other container's children, so
    // dragging a saved snippet or a palette element into one already
    // works for free through the exact same drop handling every other
    // container gets (BlockEditor.vue's drop handler doesn't care what
    // kind of container it's appending into). The new `slider` settings
    // object (autoplay/interval/loop/showNav/showHome/mode/tabsPosition/
    // navClass/arrowClass/homeClass/tabClass/activeTabClass/arrowIcon/
    // homeIcon) is read by the new preview/BlockSliderPreview.vue, which is
    // where the actual one-at-a-time, cycling carousel behavior lives -
    // editing (BlockSlider.vue) shows one slide at a time too, switched via
    // its own nav strip, but never simulates autoplay/cycling live,
    // matching how this app already treats GSAP animations/video playback
    // as preview-time-only concerns. `mode` ('standard' | 'tabs') picks
    // between the original arrows+home nav and a row of user-named tabs;
    // `tabsPosition` places that row above or below the slides;
    // `arrowIcon`/`homeIcon` pick a real SVG shape (SliderNavIcon.vue,
    // backed by @lucide/vue) for 'standard' mode's buttons instead of a
    // fixed unicode glyph.
    //
    // `navClass`/`arrowClass`/`homeClass`/`tabClass`/`activeTabClass` are
    // free-text Tailwind classes for restyling the nav to match a real
    // design - each one's *default value* is the exact classes that part
    // used to have hardcoded in the component itself, and each component
    // now applies ONLY that field's current value, nothing besides it (plus
    // positioning classes that never change - absolute placement, not
    // appearance). This was deliberately NOT built as "hardcoded defaults +
    // appended custom classes" (the first version of this feature worked
    // that way, layering a user's classes on top of built-in ones the same
    // way CustomClassesControl.vue does for an arbitrary node) - a real,
    // reported bug: setting `bg-transparent`/a lower `hover:bg-black/20`/
    // `text-black/30` alongside the built-in `bg-black/40`/`hover:bg-black
    // /60`/`text-white` had NO visible effect at all - the size classes
    // (`w-40` over the built-in `w-8`) DID take effect, which looked like
    // "it works for some properties but not others."
    //
    // Confirmed the actual mechanism by compiling both class lists through
    // the real `tailwindcss` v4 `compile()`/`build()` API directly (not
    // just read about it): when two utility classes set the *same* CSS
    // property, whichever rule's SELECTOR sorts later in Tailwind's own
    // generated stylesheet wins the cascade - and Tailwind orders same-
    // property utilities by its own internal canonical sort (alphabetical/
    // numeric by class name within each property group), completely
    // independent of which class appears later in the element's own
    // `class` attribute. Concretely: `.bg-black\/40` sorts after `.bg-
    // transparent` ("black" > "transparent"), `.text-white` sorts after
    // `.text-black\/30` ("white" > "black"), and `.hover\:bg-black\/60`
    // sorts after `.hover\:bg-black\/20` (60 > 20) - so in every one of
    // those pairs the BUILT-IN class won, regardless of the user's intent,
    // while `w-40` only "worked" by the same coincidence running the other
    // way (40 > 8). None of this is predictable from the class names
    // themselves. Making each field a full, single source of truth (no
    // second competing class list fighting it over the same properties)
    // removes the conflict entirely instead of trying to win it.
    Slider(){
        this.blocks = []
        this.type = 'container'
        this.tag = 'slider'
        this.element = 'div'
        this.label = 'Slider'
        this.icon = 'video_library'
        this.css.css = ''
        this.css.container = 'flex flex-col gap-4'
        this.slider = {
            autoplay: false,
            interval: 5000,
            loop: true,
            showNav: true,
            showHome: true,
            showDots: true,
            mode: 'standard',
            tabsPosition: 'below',
            navClass: 'flex items-center justify-center gap-1.5 flex-wrap px-2 py-2',
            arrowClass: 'w-8 h-8 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white',
            homeClass: 'w-7 h-7 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white',
            tabClass: 'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-white text-gray-600 border-gray-300 hover:border-indigo-400',
            activeTabClass: 'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-indigo-600 text-white border-indigo-600',
            tabContainerClass: '',
            dotClass: 'w-2.5 h-2.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors',
            activeDotClass: 'w-2.5 h-2.5 rounded-full bg-indigo-600 transition-colors',
            dotContainerClass: 'flex items-center justify-center gap-2 pt-3',
            arrowIcon: 'chevron',
            homeIcon: 'home'
        }
        return this
    }

    Heading(level=1){
        this.level = level
        this.element = 'h'
        this.content = 'Heading ' + level
        this.icon = 'title'
        this.editable = true
        this.helper = 'blocks/helpers/Heading.vue'
        this.dialog = 'md:w-40'
        return this
    }

    Paragraph(){
        this.element = 'p'
        this.label = 'Rich Text'
        this.icon = 'subject'
        this.content = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ac tortor dignissim convallis aenean. Imperdiet massa tincidunt nunc pulvinar.'
        this.editable = true
        return this
    }

    InlineText(){
        this.element = 'div'
        this.label = 'Inline text'
        this.icon = 'text_snippet'
        this.content = 'Inline text'
        this.editable = true
        return this
    }

    Span(){
        this.element = 'span'
        this.label = 'Span'
        this.icon = 'text_format'
        this.content = 'Simple text'
        this.editable = true
        return this
    }

    Blockquote(){
        this.element = 'blockquote'
        this.content = 'This is a quote'
        this.editable = true
        return this
    }

    Code(){
        this.element = 'pre'
        this.content = 'Code goes here'
        this.editable = true
        return this
    }

    Image(){
        this.element = 'img'
        this.label = 'Image'
        this.icon = 'insert_photo'
        this.content = ''
        this.css.css = 'w-240 h-auto'
        return this
    }

    

    Video(){
        this.element = 'video'
        this.label = 'Video'
        this.icon = 'movie'
        this.content = ''
        this.type = 'video'
        this.src = ''
        this.options = {
            controls: true,
            autoplay: true,
            loop: true
        }
        return this
    }

    YTVideo(){
        this.src = "https://youtube.com/embed/"
        this.label = 'Youtube Video'
        this.type = 'video'
        this.tag = 'youtube'
        this.element = 'iframe'
        return this
    }

    VimeoVideo(){
        this.src = "https://player.vimeo.com/video/"
        this.label = 'Vimeo Video'
        this.type = 'video'
        this.tag = 'vimeo'
        this.element = 'iframe'
        return this
    }

    // Replaces MIcon (Material Icons ligature font, never loaded in this
    // app) and Iconify (`element: 'IconifyIcon'`, never a registered
    // component) - both were confirmed dead, never actually rendering an
    // icon glyph anywhere. `content` IS the icon name here (not a separate
    // `data.icon` field) - reused directly, so this element is editable
    // exactly like Heading/Paragraph/Button (contenteditable text in the
    // canvas), and BlockElementPreview.vue resolves that same text to a
    // real @lucide/vue icon component at preview/render time (matching
    // this app's existing "dynamic behavior is a preview-time concern"
    // convention - GSAP animations and Alpine directives work the same
    // way, never simulated live in the editing canvas).
    LucideIcon(){
        this.label = 'Lucide Icon'
        this.tag = 'lucideicon'
        this.element = 'span'
        this.content = 'Settings'
        this.editable = true
        this.css.css = 'w-6 h-6'
        return this
    }

    Download(){
        this.label = 'File'
        this.icon = 'download'
        this.content = 'Download'
        this.type = 'file'
        this.tag = 'file'
        this.element = 'button'
        return this
    }

    Form(){
        this.type = 'container'
        this.blocks = []
        this.tag = 'form'
        this.element = 'form'
        this.css.container = 'flex flex-col'
        this.semantic = 'form'
        this.data['attributes'] = {
            name: 'form',
            id: 'form-id',
            action: '',
            method: 'post'
        }
        // See docs/plans/forms/cms-forms.md's "Plan" - a submission is
        // posted to /public/forms/:targetClassId/submit and created as a
        // Data Object of that class, one input's data.attributes.name per
        // target field. Only meaningful on a Form element, so set here
        // rather than in the base constructor (same treatment as the old
        // success/error/action fields this replaces).
        this.formConfig = {
            enabled: false,
            targetClassId: '',
            successMessage: '',
            errorMessage: '',
            successRedirectUrl: '',
            errorRedirectUrl: '',
            // Optional notification email on top of the Data Object write -
            // docs/plans/forms/cms-forms.md's Phase 2 and docs/plans/forms/
            // mail-templates.md. mailTemplateId points at a mail_templates
            // row (the primary reference, rendered by kind via
            // sendMailFromTemplate()); templatePageId (a whoobe_pages row)
            // is the legacy fallback, kept for already-saved Forms.
            notify: {
                enabled: false,
                mailTemplateId: '',
                templatePageId: '',
                recipientEmail: '',
                subject: ''
            }
        }
        return this
    }

    // A website search box (docs/plans/search-engine/search-element-plan.md)
    // rendered as a live <SearchElement> component on canvas/preview/public
    // page (BlockElement.vue/BlockElementPreview.vue map `element ===
    // 'search'` to that component). Submits to the spike's own /search route
    // (SearchResultsView.vue), narrowing results to whatever types/classes
    // this element's `searchConfig` allows - the Advanced tab's
    // SearchConfigControl edits that config. Mirrors the Form element's
    // own element-specific config field (this.formConfig) rather than
    // stuffing it into the generic `data` bag.
    Search(){
        this.tag = 'search'
        this.element = 'search'
        // No default container class - the container <div> is a plain block
        // (fills its parent by default), and the inner <form> is w-full, so
        // a baked-in w-full here would only fight a custom container width.
        this.css.container = ''
        this.placeholder = 'Search…'
        this.editable = false
        this.content = ''
        this.searchConfig = {
            // Which document types to include in the results.
            types: {
                page: true,
                object: true,
                asset: false
            },
            // Restrict object results to these classes (by data_classes.id);
            // empty = all object classes.
            classIds: [],
            // Tailwind classes for the live results dropdown (the search
            // element shows a dropdown on top of navigating to /search).
            // The default is pre-filled here so the box looks right out of
            // the box, but it's a normal editable field - clearing it gives
            // no styling (there is no built-in that can't be removed).
            dropdownClass: 'rounded-lg border border-gray-200 bg-white shadow-lg',
            // Tailwind classes for the search input and the submit button -
            // pre-filled with the default look, editable/removable from
            // SearchConfigControl (no hardcoded classes in the component).
            inputClass: 'w-full rounded-l-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200',
            buttonClass: 'rounded-r-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white',
            // Submit button label; when buttonIcon is true the search icon
            // is shown instead of the text.
            buttonLabel: 'Search',
            buttonIcon: false
        }
        return this
    }

    BottomNavigation(){
        this.tag = 'bottom-navigation'
        this.element = 'bottom-navigation'
        this.css.container = 'fixed bottom-0 left-0 right-0 z-50'
        this.css.css = 'flex items-center justify-around py-2 px-4 bg-white border-t border-gray-200'
        this.editable = false
        this.content = ''
        this.bottomNav = {
            items: [
                { id: this.randomID(), label: 'Home', icon: 'home', link: '/', active: true },
                { id: this.randomID(), label: 'Search', icon: 'search', link: '/search', active: false },
                { id: this.randomID(), label: 'Profile', icon: 'user', link: '/profile', active: false },
            ],
            activeColor: 'text-indigo-600',
            inactiveColor: 'text-gray-500',
            backgroundColor: 'bg-white'
        }
        return this
    }

    inputElement(){
        this.element = 'input'
        this.data.attributes = {
            name: '',
            id: '',
            placeholder: '',
            required: false
        }
        this.placeholder = ''
        this.content = ''
        this.value = ''
        this.icon = 'input'
        return this
    }

    InputText(){
        this.inputElement()
        this.type = 'text'
        this.tag = 'input'
        this.placeholder = 'Input'
        // this.type above is this Element model's own field, never rendered
        // as an HTML attribute on its own - see InputSubmit()'s comment for
        // the full explanation. Every Input*() builder needs its own real
        // `type` in data.attributes (the field customAttrs()/extraAttrs
        // actually spread onto the DOM node), not just InputSubmit()'s.
        this.data.attributes.type = 'text'
        return this
    }

    InputEmail(){
        this.inputElement()
        this.type = 'email'
        this.tag = 'input'
        this.placeholder = 'Email'
        this.data.attributes.type = 'email'
        return this
    }

    InputNumber(){
        this.inputElement()
        this.tag = 'input'
        this.type = 'number'
        this.data.attributes.type = 'number'
        return this
    }

    InputHidden(){
        this.inputElement()
        this.tag = 'input'
        this.type = 'hidden'
        this.data.attributes.type = 'hidden'
        return this
    }

    InputCheckbox(){
        this.inputElement()
        this.tag = 'input'
        this.type = 'checkbox'
        this.data.attributes.type = 'checkbox'
        // Default state a freshly-dropped checkbox starts in - configurable
        // from FormFieldControl.vue's "Checked by default" toggle. `false`
        // (not omitted) so the toggle has a real value to bind to from the
        // start, same as `required` above in inputElement().
        this.data.attributes.checked = false
        return this
    }

    InputTextarea(){
        this.data.attributes = {
            name: '',
            id: '',
            placeholder: ''
        }
        this.element = 'textarea'
        this.tag = 'input'
        this.type = 'textarea'
        this.placeholder = 'type here'
        return this
    }

    InputSelect(){
        this.inputElement()
        this.element = 'select'
        // {label,value} pairs, not a flat string[] - lets the submitted
        // value differ from the visible label (e.g. "United States" ->
        // "US"), configurable via FormFieldControl.vue's options list
        // editor. Rendered into real <option> children by helpers.ts's
        // renderSelectOptionsHtml() (BlockElement.vue/BlockElementPreview.
        // vue's displayContent) - nothing consumed data.options at all
        // before this, so a dropped Select always rendered as an empty,
        // option-less dropdown.
        this.data.options = [
            { label: 'Option A', value: 'option-a' },
            { label: 'Option B', value: 'option-b' },
            { label: 'Option C', value: 'option-c' }
        ]
        this.tag = 'select'
        this.type = 'select'
        return this
    }

    // A single self-contained field (not a container of individual Radio
    // children) - same reasoning Select() gets away with a flat options
    // list: FormFieldControl.vue's options editor and helpers.ts's
    // renderRadioGroupHtml() are shared with Select(), and every radio
    // input in the group needs the exact same `name` (data.attributes.name)
    // to behave as one mutually-exclusive group, which a single element
    // owning the whole list guarantees for free - no risk of two admins'
    // worth of drag-and-drop leaving mismatched names across separate
    // sibling elements.
    RadioGroup(){
        this.blocks = []
        this.element = 'div'
        this.label = 'Radio Group'
        this.tag = 'radiogroup'
        this.icon = 'radio_button_checked'
        this.data.attributes = {
            name: '',
            required: false
        }
        this.data.options = [
            { label: 'Option A', value: 'option-a' },
            { label: 'Option B', value: 'option-b' }
        ]
        return this
    }

    InputSubmit(){
        this.element = 'button'
        this.tag = 'submit'
        this.type = 'button'
        this.value = 'Submit'
        this.content = 'Submit'
        this.buttonIcon = ''
        this.buttonIconWidth = 16
        this.buttonIconHeight = 16
        // Not in the original - see Button()'s own comment below, same fix,
        // same reason. InputReset() calls this method first, so it inherits
        // the fix automatically.
        this.editable = true
        // this.type above is this Element model's own field, never rendered
        // as an HTML attribute - without a real `type="submit"` in
        // data.attributes (the field that IS spread onto the DOM node, see
        // helpers.ts's customAttrs()), clicking this button did nothing at
        // all inside a <form>. InputReset() overrides this to 'reset' right
        // after calling this method.
        this.data.attributes = { type: 'submit' }
        return this
    }

    InputReset(){
        this.InputSubmit()
        this.tag = 'reset'
        this.value = 'Reset'
        this.content = 'Reset'
        this.data.attributes = { type: 'reset' }
        return this
    }

    Button(){
        this.type = 'button'
        this.element = 'button'
        this.tag = 'button'
        this.content = 'button'
        this.value = 'button'
        this.buttonIcon = ''
        this.buttonIconWidth = 16
        this.buttonIconHeight = 16
        // Not in the original: Heading()/Paragraph()/InlineText()/Span()/
        // Blockquote()/Code() all set `this.editable = true` - Button()
        // (and InputSubmit(), see below) never did, even though a button's
        // visible text is exactly as much user-editable content as any of
        // those. Without it, BlockElement.vue never makes the tag
        // contenteditable and FloatingToolbar.vue's "Edit content" button
        // (gated on `element.editable`) never even appears for one -
        // there was no way at all to change a button's label. Treated as a
        // genuine omission worth fixing, not preserved for its own sake -
        // this is the one exception to this file otherwise being a
        // byte-for-byte port (see ElementsClass.d.ts's header).
        this.editable = true
        // An HTML <button> with no explicit type defaults to type="submit"
        // when it's inside a <form> - harmless while forms had no real
        // submit handler, but now that InputSubmit() actually submits (see
        // its own comment), a purely decorative Button() dropped inside a
        // Form would silently start submitting it too. Same fix as
        // InputSubmit()'s, opposite value.
        this.data.attributes = { type: 'button' }
        return this
    }
    
}
