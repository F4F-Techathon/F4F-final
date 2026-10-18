// Where the phone page is. In development the console runs on its own port (5174) beside the app on 5173; built, it
// sits at /director/ of the app's own server (npm start), so the phone page is that server's root.
export const IN_DEV = import.meta.env.DEV
export const PHONE_PAGE = IN_DEV ? '5173' : `${location.host}/`
