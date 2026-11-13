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
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'

interface CodeEditorProps {
  value: string
  language: string
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

const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', color: '#d9dde7', backgroundColor: '#111318', fontSize: '13px' },
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

export default function CodeEditor({ value, language, onChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changeHandler = useRef(onChange)
  const languageSlot = useRef(new Compartment())

  useEffect(() => {
    changeHandler.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
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
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        editorTheme,
        EditorView.lineWrapping,
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
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
    })
  }, [value])

  return <div className="code-editor" ref={host} aria-label="Code editor" />
}
