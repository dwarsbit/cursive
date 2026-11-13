# Changelog

## 0.2.0 (unreleased)

- Cite a work from Zotero: type `@` in a page and pick it from the Zotero app on your computer or your library at zotero.org. Click a citation to add the pages you cite.
- See the works a page cites in a reference list at its end, in APA style. Add one with `/bibliography`, and remove a work no citation names any more.
- Keep working without Zotero: each work is copied into the page, as a `bibliography` block in its Markdown.
- See when a work changed or was deleted in Zotero, on its citation and in the reference list, and update it from Zotero or keep your copy.
- Connect the Zotero app or a zotero.org library in Settings, with the gear in the header. In the desktop app the zotero.org key is kept in your system's credential store.
- Published sites and PDF exports show citations and the reference list in APA style.

## 0.1.0 (2026-11-12)

- Write a page in blocks: text, headings, to-do, bulleted and numbered lists, toggle, quote, callout, table, code with syntax colors, equation and divider.
- Type `/` to pick a block from a menu, and type on to filter it.
- Select text to make it bold, italic, underlined, struck through, inline code, highlighted or a link, or to turn its block into another one.
- Hover a block to add a block under it or drag it to another place. Dragging works in the desktop app too.
- Every block is read from and written to Markdown.
- Switch between Visual and Markdown mode with the buttons in the header or Cmd/Ctrl + /. Markdown mode shows the page as its file, with the title in the front matter.
- Keep a project as notes, presentations and folders: the sidebar lists them as a tree, where you add, open, rename and delete them. A note's file is named after its title.
- Right-click the tree to add a note or presentation, or to rename or delete what you clicked.
- Drag notes in the sidebar to put them in your own order, or onto a folder to move them there. The order is kept in each note's front matter.
- Drag the sidebar's edge to make it wider or narrower.
- Click under the last block of a note to write on its last line.
- See and edit a page's properties under its title. They are the front matter of its file: text, a list such as tags, a date, a number, a checkbox or a link.
- Keep your projects in the desktop app as folders in the Cursive folder in your home folder. The start screen makes a new project that starts with notes, a presentation or a tutorial, lists the projects you opened lately, and renames them or moves them to the trash.
- Open any other folder on your computer as a project with Open folder. Each page is a Markdown file in it, saved as you type, and a page or folder you delete moves to the trash.
- Rename a project by selecting its name at the top of the sidebar. In the desktop app its folder gets the same name.
- Sign in to your Polemic account in the desktop app, with the Sign in button. The sign-in happens in your browser, and Cursive keeps it in your system's credential store.
- Sync a project folder to your account. Changes travel both ways, also the ones you made offline, and two changes to the same page are both kept.
- Select your avatar in the desktop app to see who is signed in, sync the open project or stop syncing it, open your account page, or sign out.
- Open a project from your account on another computer. It gets a folder in your Cursive folder.
- Publish a project as a site with the Publish button: choose its address, publish again to bring it up to date, or unpublish it.
- Open and edit your projects in a browser, at `/cursive` on the Polemic server. What you type is saved to your account as you type.
- Make a presentation with the Add presentation button in the sidebar. The sidebar lists its slides under it, as it lists the pages in a folder: select one to work on it, drag it to another place, or delete it. Close the presentation with its arrow to hide them.
- Write each slide as a 16:9 page of blocks, with a layout (title, title and content, big number or quote) and speaker notes. Type a divider to start the next slide.
- See when a slide holds more than fits, and split it into two slides or make its text smaller.
- Present a presentation full screen with the Present button. The arrow keys and a click move between slides, and Esc ends it.
- A presentation is one Markdown file: slides between dividers, with a slide's layout in a `slide` code block and its notes in a `notes` code block.
- Add a quiz to a page from the `/` menu: a question, its options, which ones are correct, points, attempts and an explanation. In Markdown it is a `quiz` block with YAML inside.
- Add an assignment to a page from the `/` menu: a title, instructions, points and a due date. In Markdown it is an `assignment` block with YAML inside.
- Publish pages with quizzes or assignments as a tutorial: readers check their answers, see their points and mark pages as complete. Their progress is kept in their browser, and the correct answers stay on the server until a quiz is answered.
- Let readers of a tutorial sign in with a Polemic account to keep their progress in their account and hand in assignments as text. This needs a paid plan on the author's side.
- See who signed in to your tutorial from Publish → Learners: their completed pages, quiz points and handed-in work.
- Give a published site a theme in the Publish dialog: Cursive, Journal, Plum, Blueprint, Midnight or Poster. A theme sets the colors, typefaces and shapes of every page, slide and quiz.
- Add more tutorial blocks from the `/` menu: learning goals, key terms, a video, before and after, fill in the blanks, put in order, an exercise with a hint and a model answer, and flashcards. In Markdown each is a block named after it (`goals`, `terms`, `video`, `compare`, `blanks`, `order`, `exercise`, `flashcards`) with YAML inside.
- Give an assignment a rubric: criteria with points that add up to the assignment's points. Tick "Learners can add a file" to take a file next to the text.
- Grade handed-in work from Publish → Learners: give points per criterion of the rubric, or one score, and write feedback. The learner sees the grade on the page. Save a file a learner handed in from the same place.
- Cursive has its own icon, an asterisk on a page, and rust as its color in the app and on published sites with the Cursive theme.
- Export a page, a presentation or the whole project as a PDF with the Export button or Cmd/Ctrl + P. Cursive opens the print window, where you choose “Save as PDF”.
- A presentation becomes a PDF with one slide per page, or with speaker notes: the slides on paper with their notes under them. A whole project starts with a list of its pages, and each page starts on a new sheet.
- Tutorial blocks are printed as a handout: questions without their answers, hints and explanations.
- Rename a page or a presentation by double-clicking it in the sidebar.
- The desktop app on macOS has no title bar: the sidebar and the page use that space, and you drag the window by the top of either.
