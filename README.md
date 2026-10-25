# Gemini Lernmodus (Opera GX Extension)

Markiere Gemini-Chats mit dem Textmarker und lass Claude daraus eine Lernzusammenfassung erstellen – komplett kostenlos, ohne API-Key.

## Installation in Opera GX
1. `opera://extensions` öffnen
2. Oben rechts **Entwicklermodus** einschalten
3. **Entpackte Erweiterung laden** → diesen Ordner (`MarkExtension`) auswählen
4. Extension anpinnen (Puzzle-Symbol in der Leiste)

## Benutzung
- Gemini-Chat öffnen → Icon anklicken → **Lernmodus** einschalten (oder `Alt+Shift+L`)
- Text in einer Nachricht markieren = Textmarker in der gewählten Farbe
  - Gelb **Wichtig** · Grün **Definition** · Rosa **Unklar** · Blau **Beispiel**
- Markierung anklicken → Farbe ändern oder entfernen
- **✨ An Claude geben**: lädt den kompletten Chat, kopiert ihn mit deinen Markierungen und einer fertigen Anleitung in die Zwischenablage und öffnet claude.ai → dort `Strg+V` und abschicken. Claude erstellt die Zusammenfassung als Dokument zum Herunterladen.
- **Nur Markierungen**: exportiert deine Markierungen direkt als HTML/Markdown-Datei

Markierungen werden pro Chat lokal gespeichert und beim nächsten Öffnen wiederhergestellt.

## Hinweise
- Die „Gedanken“ von Gemini Pro (Thinking) werden nicht mitkopiert, nur die eigentlichen Antworten.
- Längenlimit: Ist der Chat länger als die eingestellte Höchstlänge (Einstellungen, Standard 300.000 Zeichen), werden die ältesten Nachrichten weggelassen. Die Markierungen bleiben immer vollständig drin. Meldet claude.ai trotzdem „zu lang“, eine kleinere Stufe wählen.
- Wenn Google das Gemini-Layout ändert, müssen eventuell die Selektoren in `content.js` (`MSG_SELECTOR`, `toMessage`) angepasst werden.
