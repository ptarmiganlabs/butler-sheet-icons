# 1. Example: Using Butler Sheet Icons with Qlik Sense Enterprise on Windows

Below is an example where BSI is used to create and update sheet icons for a QSEoW application.

- There are three sheets in the app
- There exists a content library called `abc 123`.

Let's first look at the app overview *before* running BSI:

![Qlik Sense app overview](./img/create-qseow-appoverview_1.png "No customized sheet icons")

Note that there are no sheet icons on any of the 3 sheets.

Same thing when looking at the `abc 123` content library - it's empty:

![Qlik Sense content library](./img/create-qseow-qmc_1.png "Empty content library")

Now let's run Butler Sheet Icons.

On MacOs it looks like this with INFO level debugging:

![Run Butler Sheet Icons](./img/create-qseow_1.png "Run Butler Sheet Icons on MacOS")

On Windows10 you will see something like below.  
Note how strings are enclosed with double quotes rather than single quotes, and how the image directory path is specified:

![Run Butler Sheet Icons](./img/create-qseow-win_2.png "Run Butler Sheet Icons on Windows 10")

Once again opening the app's overview page we see that it now has new sheet icons for all sheets.

![Qlik Sense app overview](./img/create-qseow-appoverview_2.png "Customized sheet icons")

Butler Sheet Icons will take screenshots of all sheets, but also of the login page and the app overview page.

Looking in the `abc 123` content library it now has a image for each sheet in the app. The format used for the images in the content library is

    app-<app id>-sheet-<sheet number>.png

For example `app-a3e0f5d2-000a-464f-998d-33d333b175d7-sheet-2.png`.

Finally, looking in the ./img directory (as specified by the `--imagedir` option) we find the three sheet screen shots, but also three screenshots associated with the app itself. Two are from the login page when Butler Sheet Icons logs into Qlik Sense and one is from the app overview within the Sense app (before the sheets got new sheet icons!):

![Image files created by Butler Sheet Icons](./img/create-qseow-created-images_1.png "Image files created by Butler Sheet Icons")

![Qlik Sense login page 1](./img/create-qseow-loginpage_1.png "Qlik Sense login page before user credentials are entered")

![Qlik Sense login page 2](./img/create-qseow-loginpage_2.png "Qlik Sense login page with user credentials filled in")

![Qlik Sense app overview](./img/create-qseow-appoverview_3.png "App overview screenshot taken by Butler Sheet Icons")
