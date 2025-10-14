import React, { useState, useRef, useEffect } from "react";
import "./RichTextEditor.css";

const RichTextEditor = ({
  value = "",
  onChange,
  placeholder = "Write your message...",
  minHeight,
  maxHeight = "200px",
  disabled = false,
  style = {},
  className = "",
}) => {
  const editorRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [textColor, setTextColor] = useState("#000000");

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    if (url) {
      execCommand("createLink", url);
    }
  };

  const insertCode = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const code = document.createElement("code");
      code.style.backgroundColor = "#f1f3f4";
      code.style.padding = "2px 4px";
      code.style.borderRadius = "3px";
      code.style.fontFamily = "monospace";

      try {
        range.surroundContents(code);
      } catch {
        code.textContent = range.toString();
        range.deleteContents();
        range.insertNode(code);
      }

      selection.removeAllRanges();
      handleInput();
    }
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "b":
          e.preventDefault();
          execCommand("bold");
          break;
        case "i":
          e.preventDefault();
          execCommand("italic");
          break;
        case "u":
          e.preventDefault();
          execCommand("underline");
          break;
        case "k":
          e.preventDefault();
          insertLink();
          break;
        default:
          break;
      }
    }
  };

  const applyColor = (color) => {
    setTextColor(color);
    execCommand("foreColor", color);
    setShowColorPicker(false);
  };

  return (
    <div
      className={`rich-text-editor ${isExpanded ? "expanded" : ""} ${className}`}
      style={style}
    >
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          {/* Bold */}
          <button
            type="button"
            onClick={() => execCommand("bold")}
            className="toolbar-btn"
            title="Bold (Ctrl+B)"
            disabled={disabled}
          >
            <b>B</b>
          </button>

          {/* Italic */}
          <button
            type="button"
            onClick={() => execCommand("italic")}
            className="toolbar-btn"
            title="Italic (Ctrl+I)"
            disabled={disabled}
          >
            <i>I</i>
          </button>

          {/* Underline */}
          <button
            type="button"
            onClick={() => execCommand("underline")}
            className="toolbar-btn"
            title="Underline (Ctrl+U)"
            disabled={disabled}
          >
            <u>U</u>
          </button>

          {/* Color Picker */}
          <div className="color-picker-wrapper">
            <button
              type="button"
              className="toolbar-btn"
              title="Text Color"
              onClick={() => setShowColorPicker(!showColorPicker)}
              disabled={disabled}
            >
              🎨
            </button>
            {showColorPicker && (
              <input
                type="color"
                className="color-picker"
                value={textColor}
                onChange={(e) => applyColor(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="toolbar-divider" />

        {/* Lists */}
        <div className="toolbar-group">
          <button
            type="button"
            onClick={() => execCommand("insertUnorderedList")}
            className="toolbar-btn"
            title="Bullet List"
            disabled={disabled}
          >
            • List
          </button>

          <button
            type="button"
            onClick={() => execCommand("insertOrderedList")}
            className="toolbar-btn"
            title="Numbered List"
            disabled={disabled}
          >
            1. List
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Link + Code */}
        <div className="toolbar-group">
          <button
            type="button"
            onClick={insertLink}
            className="toolbar-btn"
            title="Insert Link (Ctrl+K)"
            disabled={disabled}
          >
            🔗
          </button>

          <button
            type="button"
            onClick={insertCode}
            className="toolbar-btn"
            title="Code"
            disabled={disabled}
          >
            {"</>"}
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Expand */}
        <div className="toolbar-group">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="toolbar-btn"
            title={isExpanded ? "Collapse" : "Expand"}
            disabled={disabled}
          >
            {isExpanded ? "🔽" : "🔼"}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div
        ref={editorRef}
        className="editor-content"
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        style={{
          ...(minHeight ? { minHeight } : {}),
          ...(maxHeight ? { maxHeight } : {}),
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />
    </div>
  );
};

export default RichTextEditor;
