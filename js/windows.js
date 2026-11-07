// Configure real projects here: projectTitle names the folder; href opens that project.
// An empty href keeps the folder inactive unless a label is set: then it stays a
// draggable placeholder that shows the double-click hint until its page is ready.
// Set action: 'contact' to open the floating CONTACT.DOSSIER Mac window instead of
// navigating. Windows with no configured folder stay in the Dock until their icon is
// clicked. Window maximization uses the yellow title-bar control.
window.ShuikeWindows = [
  { id: 'window-01', title: '窗口 01', text: '', href: 'index.html', linkLabel: 'About me' },
  { id: 'window-02', title: '窗口 02', text: '', href: '', linkLabel: 'Contact', action: 'contact' },
  { id: 'window-03', title: '窗口 03', text: '', href: '', linkLabel: 'Blog' },
  { id: 'window-04', title: '窗口 04', text: '', href: 'projects/index.html', linkLabel: 'Project' },
  { id: 'window-05', title: '窗口 05', text: '', href: '', linkLabel: 'Courses' }
];
