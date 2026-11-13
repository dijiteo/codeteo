import { useEffect, useRef } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap, completeAnyWord, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, highlightSelectionMatches, openSearchPanel, replaceAll, replaceNext, search, SearchQuery, searchKeymap, setSearchQuery } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  type Panel,
} from '@codemirror/view'

interface CodeEditorProps {
  value: string
  language: string
  fontSize: number
  tabSize: number
  wordWrap: boolean
  lineNumbers: boolean
  onChange(value: string): void
}

function languageExtension(language: string) {
  switch (language) {
    case 'typescript':
      return javascript({ typescript: true, jsx: true })
    case 'javascript':
      return javascript({ jsx: true })
    case 'json':
      return json()
    case 'html':
      return html()
    case 'css':
      return css()
    case 'markdown':
      return markdown()
    case 'python':
      return python()
    case 'rust':
      return rust()
    case 'sql':
      return sql()
    case 'xml':
      return xml()
    case 'yaml':
      return yaml()
    default:
      return []
  }
}

function createTurkishSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div')
  dom.className = 'cm-search cm-searchPanel'
  const form = document.createElement('form')
  form.className = 'cm-search-form'
  form.addEventListener('submit', (event) => event.preventDefault())

  const searchInput = document.createElement('input')
  searchInput.className = 'cm-textfield'
  searchInput.placeholder = 'Bul'
  searchInput.setAttribute('aria-label', 'Aranacak metin')
  searchInput.setAttribute('main-field', 'true')
  const initialQuery = getSearchQuery(view.state)
  searchInput.value = initialQuery.search
  const replaceInput = document.createElement('input')
  replaceInput.className = 'cm-textfield'
  replaceInput.placeholder = 'Şununla değiştir'
  replaceInput.setAttribute('aria-label', 'Yeni metin')
  replaceInput.value = initialQuery.replace

  const caseLabel = document.createElement('label')
  const caseBox = document.createElement('input')
  caseBox.type = 'checkbox'
  caseBox.checked = initialQuery.caseSensitive
  caseLabel.append(caseBox, document.createTextNode(' Büyük/küçük harf'))
  const wordLabel = document.createElement('label')
  const wordBox = document.createElement('input')
  wordBox.type = 'checkbox'
  wordBox.checked = initialQuery.wholeWord
  wordLabel.append(wordBox, document.createTextNode(' Tam sözcük'))

  const queryChanged = () => view.dispatch({ effects: setSearchQuery.of(new SearchQuery({
    search: searchInput.value,
    replace: replaceInput.value,
    caseSensitive: caseBox.checked,
    wholeWord: wordBox.checked,
    literal: true,
  })) })
  searchInput.addEventListener('input', () => { queryChanged(); if (searchInput.value) findNext(view) })
  replaceInput.addEventListener('input', queryChanged)
  caseBox.addEventListener('change', () => { queryChanged(); if (searchInput.value) findNext(view) })
  wordBox.addEventListener('change', () => { queryChanged(); if (searchInput.value) findNext(view) })
  for (const input of [searchInput, replaceInput]) input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeSearchPanel(view) }
    else if (event.key === 'Enter') { event.preventDefault(); event.shiftKey ? findPrevious(view) : findNext(view) }
  })

  const button = (label: string, title: string, action: () => void) => {
    const control = document.createElement('button')
    control.type = 'button'
    control.className = 'cm-button'
    control.textContent = label
    control.title = title
    control.addEventListener('click', action)
    return control
  }
  form.append(searchInput, replaceInput, caseLabel, wordLabel,
    button('Önceki', 'Önceki sonucu bul', () => findPrevious(view)),
    button('Sonraki', 'Sonraki sonucu bul', () => findNext(view)),
    button('Değiştir', 'Bulunan sonucu değiştir', () => replaceNext(view)),
    button('Tümünü değiştir', 'Tüm sonuçları değiştir', () => replaceAll(view)),
    button('Kapat', 'Arama panelini kapat', () => closeSearchPanel(view)))
  dom.append(form)
  return { dom, top: true, mount: () => { searchInput.focus(); searchInput.select() } }
}

const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', color: '#d9dde7', backgroundColor: '#111318' },
    '.cm-content': { fontFamily: "'Cascadia Code', Consolas, monospace", padding: '15px 0', caretColor: '#8ab4ff' },
    '.cm-gutters': { backgroundColor: '#111318', color: '#606674', border: 'none' },
    '.cm-activeLineGutter': { color: '#bac4d8', backgroundColor: '#1a1d25' },
    '.cm-activeLine': { backgroundColor: '#171a21' },
    '.cm-selectionBackground, ::selection': { backgroundColor: '#29415f !important' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#8ab4ff' },
    '.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto', fontFamily: "'Cascadia Code', Consolas, monospace" },
    '.cm-foldGutter .cm-gutterElement': { color: '#606674', cursor: 'pointer' },
    '.cm-matchingBracket': { backgroundColor: '#29415f', outline: '1px solid #3e5f8a' },
    '.cm-nonmatchingBracket': { backgroundColor: '#5a2a2e' },
    '.cm-searchMatch': { backgroundColor: '#e6c87933', outline: '1px solid #e6c87966' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#8ab4ff55' },
    '.cm-selectionMatch': { backgroundColor: '#ffffff14' },
    '.cm-panels': { color: '#d9dde7', backgroundColor: '#171a21' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #2a2e38' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #2a2e38' },
    '.cm-search': { fontFamily: 'inherit', fontSize: '12px', padding: '6px 10px' },
    '.cm-searchPanel .cm-search-form': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px' },
    '.cm-searchPanel .cm-textfield': { width: '170px', fontSize: '11px' },
    '.cm-searchPanel label': { display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#9ca4b3', fontSize: '10px' },
    '.cm-search label': { color: '#9ca4b3' },
    '.cm-textfield': { color: '#e2e6ef', backgroundColor: '#111318', border: '1px solid #343a46', borderRadius: '4px', padding: '3px 6px' },
    '.cm-textfield:focus': { borderColor: '#8ab4ff', outline: 'none' },
    '.cm-button': { color: '#c2c8d4', backgroundImage: 'none', backgroundColor: '#222630', border: '1px solid #343a46', borderRadius: '4px' },
    '.cm-button:hover': { backgroundColor: '#2b303a' },
    '.cm-panel button[name=close]': { color: '#9ca4b3' },
    '.cm-tooltip': { color: '#d9dde7', backgroundColor: '#1c2029', border: '1px solid #343a46', borderRadius: '6px' },
    '.cm-tooltip-autocomplete > ul': { fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: '12px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { color: '#ffffff', backgroundColor: '#29415f' },
    '.cm-completionDetail': { color: '#7d8696' },
  },
  { dark: true },
)

export default function CodeEditor({ value, language, fontSize, tabSize, wordWrap, lineNumbers: showLineNumbers, onChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changeHandler = useRef(onChange)
  const languageSlot = useRef(new Compartment())
  const fontSlot = useRef(new Compartment())
  const wrapSlot = useRef(new Compartment())
  const indentSlot = useRef(new Compartment())
  const lineNumbersSlot = useRef(new Compartment())

  useEffect(() => {
    changeHandler.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbersSlot.current.of(showLineNumbers ? lineNumbers() : []),
        foldGutter(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ createPanel: createTurkishSearchPanel }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          { key: 'Mod-h', run: openSearchPanel, preventDefault: true },
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        languageSlot.current.of(languageExtension(language)),
        fontSlot.current.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
        wrapSlot.current.of(wordWrap ? EditorView.lineWrapping : []),
        indentSlot.current.of([EditorState.tabSize.of(tabSize), indentUnit.of(' '.repeat(tabSize))]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) changeHandler.current(update.state.doc.toString())
        }),
      ],
    })
    const editor = new EditorView({ state, parent: host.current })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: languageSlot.current.reconfigure(languageExtension(language)) })
  }, [language])

  useEffect(() => {
    view.current?.dispatch({ effects: [
      fontSlot.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
      wrapSlot.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      indentSlot.current.reconfigure([EditorState.tabSize.of(tabSize), indentUnit.of(' '.repeat(tabSize))]),
      lineNumbersSlot.current.reconfigure(showLineNumbers ? lineNumbers() : []),
    ] })
  }, [fontSize, tabSize, wordWrap, showLineNumbers])

  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
    })
  }, [value])

  return <div className="code-editor" ref={host} aria-label="Kod düzenleyici" />
}
