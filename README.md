<p align="center"><img src="docs/butler sheet icons_small.png"><p>
<h3 align="center">Automatically create Qlik Sense sheet thumbnail images</h3>
</p>

---

<p align="center">
<a href="https://github.com/ptarmiganlabs/butler-sheet-icons"><img src="https://img.shields.io/badge/Source---" alt="Source"></a>
<a href="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/ci.yaml"><img src="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/ci.yaml/badge.svg?branch=main" alt="Build status"></a>
<a href="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/docker-image-build.yaml"><img src="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/docker-image-build.yaml/badge.svg" alt="Docker image build"></a>
<a href="https://www.repostatus.org/#active"><img src="https://www.repostatus.org/badges/latest/active.svg" alt="Project Status: Active – The project has reached a stable, usable state and is being actively developed." /></a>

---

A cross-platform, command-line tool (plus Docker!) for creating sheet thumbnails based on the actual layout of sheets in Qlik Sense apps.

Works on both Qlik Sense Cloud apps and Qlik Sense Enterprise on Windows (QSEoW) apps.

## Key Features

- Cross-platform support: Windows, macOS, Linux, and Docker.
- Automatically create sheet thumbnails based on actual sheet layouts.
- Supports Qlik Sense Cloud and Qlik Sense Enterprise on Windows (QSEoW).
- Multi-app support using tags (QSEoW) or collections (QS Cloud).
- Ability to exclude or blur specific sheets.
- Stand-alone binaries available for easy installation.
- Integration with CI/CD pipelines.

Butler Sheet Icons ("BSI") can create sheet thumbnail icons for a single app or many - in both Qlik Sense Cloud and client-managed Qlik Sense Enterprise on Windows (QSEoW).  
It can also remove sheet icons from Sense apps if needed.

Handling multiple apps is straightforward: Use the QMC (for QSEoW) to tag the apps that should be updated, or add the apps to a collection (Qlik Sense Cloud).  
Then run Butler Sheet Icons and all apps will get new sheet icons automatically!

---

Butler Sheet Icons is an open-source project sponsored by Ptarmigan Labs.  
At [ptarmiganlabs.com](https://ptarmiganlabs.com) you will find articles about how the various open-source Butler tools can help you get the most out of Qlik Sense.

For support and services relating to the Butler family of tools or Qlik Sense projects in general, please contact info -at- ptarmiganlabs -dot- com.

Or [sign up to the newsletter](https://ptarmiganlabs.com/#/portal/signup) to get the latest Qlik Sense superpower updates straight to your inbox!

---

## Quick Start

Are you the impatient kind and just want to try it out?  
No worries, here's what you need for Qlik Sense Cloud:

1. [Download](https://github.com/ptarmiganlabs/butler-sheet-icons/releases/latest) the binary you need (Windows, macOS, Docker).
2. [Create an API key](https://qlik.dev/authenticate/api-key/generate-your-first-api-key) for Qlik Sense Cloud.
3. Make sure you know your Qlik Sense Cloud tenant URL, user ID, password, and ID of the app to update.
   - The tenant URL can be specified with or without the `https://` prefix.
4. Run Butler Sheet Icons with the options below (adapt as needed).
5. 🎉😎 Sit back and enjoy not having to manually screenshot and process those 10 sheets each in 50 different apps...

Butler Sheet Icons tries to offer sane defaults, making the most basic use cases as simple as possible.  
For example, updating sheets in a QS Cloud app can be as simple as (running BSI on Windows):

```PowerShell
butler-sheet-icons.exe qscloud create-sheet-icons `
  --tenanturl <your-tenant> `
  --apikey <your-key> `
  --logonuserid <your-user-id> `
  --logonpwd <your-password> `
  --appid <app id>
```

Similarly, removing all sheet icons from a QS Cloud app can be done with (again, on Windows):

```PowerShell
butler-sheet-icons.exe qscloud remove-sheet-icons `
  --tenanturl <your-tenant> `
  --apikey <your-key> `
  --appid <app id>
```

---

## Table of Contents

- [Demo](#demo)
- [Introduction](#introduction)
  - [The Basics](#the-basics)
  - [How Does Butler Sheet Icons Work?](#how-does-butler-sheet-icons-work)
  - [Sample Screenshots](#sample-screenshots)
- [Upgrading from Previous Versions](#upgrading-from-previous-versions)
  - [From 2.x to 3.0](#from-2x-to-30)
- [Install](#install)
  - [Most Common Scenario: Stand-alone Tool](#most-common-scenario-stand-alone-tool)
  - [The Sometimes Scenario: Docker Container](#the-sometimes-scenario-docker-container)
  - [Least Common Scenario: Node.js Application](#least-common-scenario-nodejs-application)
- [Configuration](#configuration)
  - [QS Cloud](#qs-cloud)
    - [Create API Key](#create-api-key)
  - [Client-managed QSEoW](#client-managed-qseow)
    - [Certificates](#certificates)
    - [Content Libraries](#content-libraries)
- [Concepts](#concepts)
  - [Concepts Shared Between QS Cloud and Client-managed QS](#concepts-shared-between-qs-cloud-and-client-managed-qs)
    - [Logging](#logging)
    - [Hidden Sheets Never Updated](#hidden-sheets-never-updated)
    - [Which Part of Each Sheet to Use as Thumbnail](#which-part-of-each-sheet-to-use-as-thumbnail)
    - [Excluding Sheets](#excluding-sheets)
    - [Excluding Sheets Based on the Sheet's Status](#excluding-sheets-based-on-the-sheets-status)
    - [Blurring Sheet Icons](#blurring-sheet-icons)
    - [Screenshots Taken by Butler Sheet Icons](#screenshots-taken-by-butler-sheet-icons)
    - [Headless Browser](#headless-browser)
    - [Downloading a Browser](#downloading-a-browser)
    - [Using BSI with a Proxy Server](#using-bsi-with-a-proxy-server)
  - [Concepts Specific to QS Cloud](#concepts-specific-to-qs-cloud)
    - [Logging into QS Cloud](#logging-into-qs-cloud)
    - [Skipping the Login Page](#skipping-the-login-page)
  - [Concepts Specific to Client-managed QS (QSEoW)](#concepts-specific-to-client-managed-qs-qseow)
    - [Which Version is the Sense Server Using](#which-version-is-the-sense-server-using)
    - [Login Method](#login-method)
    - [Using QSEoW's Built-in Node.js](#using-qseows-built-in-nodejs)
- [Commands](#commands)
  - [qseow](#qseow)
    - [create-sheet-thumbnails](#create-sheet-thumbnails)
    - [remove-sheet-icons](#remove-sheet-icons)
  - [qscloud](#qscloud)
    - [create-sheet-thumbnails](#create-sheet-thumbnails-1)
    - [list-collections](#list-collections)
    - [remove-sheet-icons](#remove-sheet-icons-1)
  - [browser](#browser)
    - [list-installed](#list-installed)
    - [uninstall](#uninstall)
    - [uninstall-all](#uninstall-all)
    - [install](#install-1)
      - [Older Versions of Chrome](#older-versions-of-chrome)
      - [Older Versions of Firefox](#older-versions-of-firefox)
    - [list-available](#list-available)
- [Hands-on Examples](#hands-on-examples)
  - [QS Cloud, Update a Single App + Apps in Collection](#qs-cloud-update-a-single-app--apps-in-collection)
  - [QS Cloud, List All Available Collections](#qs-cloud-list-all-available-collections)
  - [Client-managed/QSEoW, Update a Single App + Apps with a Certain Tag, Exclude Some Sheets](#client-managedqseow-update-a-single-app--apps-with-a-certain-tag-exclude-some-sheets)
  - [QS Cloud, Docker Container, Show Help Text](#qs-cloud-docker-container-show-help-text)
  - [QS Cloud, Docker Container, Update a Single App + Apps in Collection](#qs-cloud-docker-container-update-a-single-app--apps-in-collection)
  - [List Installed Browsers](#list-installed-browsers)
  - [Install a Browser into the BSI Cache](#install-a-browser-into-the-bsi-cache)
  - [Show What Browsers Are Available for Download and Use with BSI](#show-what-browsers-are-available-for-download-and-use-with-bsi)
  - [Uninstall a Browser from the BSI Cache](#uninstall-a-browser-from-the-bsi-cache)
  - [Uninstall All Browsers from the BSI Cache](#uninstall-all-browsers-from-the-bsi-cache)
- [Supported Qlik Sense Versions](#supported-qlik-sense-versions)
  - [Client-managed Qlik Sense (=Qlik Sense Enterprise on Windows)](#client-managed-qlik-sense-qlik-sense-enterprise-on-windows)
  - [Qlik Sense Cloud](#qlik-sense-cloud)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
    - [Login Problems](#login-problems)
    - [Certificate Errors](#certificate-errors)
    - [Browser Issues](#browser-issues)
    - [Sheet Exclusion](#sheet-exclusion)
- [Security and Disclosure](#security-and-disclosure)
  - [Platform Specific Security Information](#platform-specific-security-information)
    - [Windows](#windows)
    - [macOS](#macos)
- [Contribution](#contribution)
  - [How to Contribute](#how-to-contribute)
  - [Guidelines](#guidelines)

---

# Demo

Here a Qlik Sense Cloud app is updated by running (a slightly older version of) Butler Sheet Icons on a macOS laptop:

![Running Butler Sheet Icons on macOS](./docs/img/qscloud-create-thumbnails-macos-bash-animated-1.gif "Running Butler Sheet Icons on macOS")

# Introduction

## The Basics

- Qlik Sense applications contain zero or more _sheets_.
- Each sheet contains various kinds of charts, KPIs, texts, or other visualizations.
- A sheet icon/thumbnail image can be added to each sheet in a Sense app.  
  This image provides visual guidance and makes it easier for users to find the sheet they are looking for within a Sense app.

There are various approaches when it comes to creating useful sheet icons:

1. Use random images you've found somewhere online.  
   Usually not recommended, at least not if you want a consistent, professional-looking Sense application.
2. Use animated GIFs.  
   If it's a good idea? You decide... examples can be found in the blog post "[Animated GIF horror for Qlik Sense](https://ptarmiganlabs.com/animated-gif-horror-for-qlik-sense/)".
3. Use a professional icon/image library such as Font Awesome.  
   This gives you a nice, consistent look across all sheet icons. Converting the images to a suitable format and uploading them to Qlik Sense can be a challenge though; here tools such as [Butler Icon Upload](https://github.com/ptarmiganlabs/butler-icon-upload) can greatly simplify things.
4. Create thumbnail images that are miniatures of the actual sheet layout.  
   The idea here is to take screenshots of all app sheets and then use these screenshots as thumbnail images for each sheet.

> **_The goal of the Butler Sheet Icons project is to automate option 4 above._**

Specifically:

- The tool is cross-platform and runs on Windows, macOS, Linux, and as a Docker container.
- Stand-alone, download-and-use binaries for Windows, macOS, and Linux are available.
  - The macOS binary is notarized by Apple.
  - The Windows binary is signed with a commercial signing certificate from Certum.
- Works on both Qlik Sense Cloud and client-managed Qlik Sense Enterprise on Windows. Qlik Sense Desktop is not supported.
- A single command will create thumbnail images, upload them to Qlik Sense, and assign them as sheet icons to sheets in the Sense app(s).

By using, for example, PowerShell (which runs on Windows, macOS, and Linux these days!) and [qlik-cli](https://qlik.dev/libraries-and-tools/qlik-cli) (which is an official, supported tool from Qlik), it's possible to automatically create sheet thumbnails for **_all_** sheets in **_all_** apps in a Qlik Sense environment!

Use cases for Butler Sheet Icons include:

- Manual, one-off updates of a Sense app's sheet icons.
- Bulk update of all sheet icons in many apps.
- Update sheet icons automatically as part of a CI/CD pipeline.

## How Does Butler Sheet Icons Work?

The idea is simply to more or less mimic the steps a human would take to create sheet thumbnails, with some steps replaced with calls to the Sense APIs.

- Butler Sheet Icons uses its own embedded web browser to log into Qlik Sense.
- Qlik keeps developing and refining the Sense web front-end. This means that different Sense versions may work slightly differently behind what may seem like identical web user interfaces. Butler Sheet Icons, however, needs to adapt to this.
  - The solution is to specify which Sense version you will connect to. This is done using the `--sense-version` command line parameter.
  - The above is only applicable to client-managed Qlik Sense, a.k.a. Qlik Sense Enterprise on Windows, QSEoW.
- For the first app that should get new sheet thumbnails...
  - Use Sense APIs to determine which sheets exist in the app.
  - Move to the app's first sheet using the browser.
    - Wait for the sheet to load.
    - Take a screenshot of the desired part of the sheet.
    - Resize the screenshot to the correct size and aspect ratio.
    - Save the thumbnail image to disk.
    - Create a blurred version of the thumbnail image. Blurred images are created for all sheets, for possible future use.
    - Save the blurred image to disk.
  - Repeat the previous step for each sheet in the app (public and private sheets are both processed).
  - Update sheet images.
    - Use Sense APIs to upload the thumbnail images to Sense (QSEoW or QS Cloud).
    - Assign the images to the correct sheet in the correct app. Blurred images will be used for the sheets matching the filter criteria specified via `--blur-sheet-....` command line options.
- Repeat the previous step for each app that should be processed.
  - Apps can be specified in several ways:
    - By app ID (both QS Cloud and QSEoW).
    - By tag (QSEoW). All apps having the specified tag will be updated.
    - By collection (QS Cloud). All apps part of the specified collection will be updated.
- It's possible to specify that some sheets should _not_ get new sheet icons. Exclude sheets can be specified using:
  - Sheet position in the app. For example, sheet 3, 7, and 8.
  - Sheet title. For example, sheet "Intro" and "Definitions".
  - Sheet status, i.e., whether the sheet is public, published, or private.
  - All sheets tagged with a specific tag. Only available on client-managed Qlik Sense Enterprise as tags are not available in Qlik Cloud.

## Sample Screenshots

Using Butler Sheet Icons on macOS, updating sheet icons in a client-managed Qlik Sense Enterprise on Windows app can look like below.  
Environment variables are used to store most parameters, which makes it easier to run the command without having to remember all the parameter values.

The command below could actually be slimmed down a bit given that many of the options have good default values, but it's shown here with a full set of parameters to make it easier to understand what's going on. Please note that environment variables are used to pass in some of the actual values.

```bash
./butler-sheet-icons qseow create-sheet-thumbnails \
  --loglevel info \
  --host $BSI_HOST \
  --appid $BSI_APP_ID \
  --apiuserdir 'Internal' \
  --apiuserid sa_api \
  --logonuserdir $BSI_LOGON_USER_DIR \
  --logonuserid $BSI_LOGON_USER_ID \
  --logonpwd $BSI_LOGON_PWD \
  --contentlibrary $BSI_CONTENT_LIBRARY \
  --pagewait 5 \
  --secure true \
  --imagedir ./img \
  --certfile $BSI_CERT_FILE \
  --certkeyfile $BSI_CERT_KEY_FILE \
  --includesheetpart 1 \
  --headless true \
  --exclude-sheet-tag '❌excludeSheetThumbnailUpdate' \
  --exclude-sheet-title 'Sheet 5' 'Debug sheet' \
  --exclude-sheet-number 1 2 \
  --exclude-sheet-status private \
  --blur-sheet-number 3 5 \
  --blur-factor 10 \
  --sense-version 2024-Feb
```

![Run Butler Sheet Icons](./docs/img/create-qseow_macos_1.png "Run Butler Sheet Icons on macOS")

Same as above, running in PowerShell on Windows 10.  
In this case (on Windows) we need to add the `--prefix form` parameter, otherwise BSI will try to use Windows authentication to log in to the Sense server.  
The `--prefix form` parameter tells BSI to use a Qlik Sense virtual proxy that uses form-based authentication.

![Run Butler Sheet Icons](./docs/img/create-qseow-win_2.png "Run Butler Sheet Icons on Windows 10")

App overview before running Butler Sheet Icons:
![Qlik Sense app overview](./docs/img/create-qseow-appoverview_1.png "No sheet icons")

App overview showing the sheet thumbnails generated by Butler Sheet Icons:

![Qlik Sense app overview](./docs/img/create-qseow-appoverview_2.png "Customized sheet icons")

# Upgrading from Previous Versions

## From 2.x to 3.0

- The `--sense-version` parameter is a new mandatory parameter. Available options are "pre-2022-Nov", "2022-Nov", "2023-Feb", "2023-May" etc.  
  The list of allowed values is available in the BSI help that's shown by running `.\butler-sheet-icons.exe qseow create-sheet-thumbnails --help` (on Windows/PowerShell in this case).

# Install

## Most Common Scenario: Stand-alone Tool

Butler Sheet Icons does not need to be installed.

It is a standalone, cross-platform executable that is just downloaded and executed.

The latest version is always available from the [download page](https://github.com/ptarmiganlabs/butler-sheet-icons/releases).
Make sure to check for new versions (and star the [GitHub repository](https://github.com/ptarmiganlabs/butler-sheet-icons) and subscribe to updates!) - new features are added and security updates applied.

## The Sometimes Scenario: Docker Container

The Docker image of BSI is intended to be used on Linux, macOS, or in a Kubernetes cluster.

It may be possible to use the image also on Windows, at least when using the Linux subsystem that's available these days. This has however not been tested - your mileage may vary.

## Least Common Scenario: Node.js Application

While you don't _have_ to install Butler Sheet Icons (BSI), it is in fact possible if there is a need to. For example, if you want to develop the tool further or in other ways change it, you will need to do a proper Node.js installation.

BSI is written in [Node.js](https://nodejs.org/en/) and can as such be installed like any other Node.js application.

This scenario is for advanced users that already know the ins and outs of running Node.js applications. Only brief instructions are therefore given here.

On a high level the steps are:

1. Install [Node.js](https://nodejs.org/en/) if not already installed.  
   BSI is always tested against the most recent LTS version of Node.js, but any reasonably recent version is likely to work.
2. Download source code for the desired BSI version (latest stable version recommended!) from the [download page](https://github.com/ptarmiganlabs/butler-sheet-icons/releases).
   1. Specifically - **do not** use the main branch in the GitHub repository. It does not necessarily reflect the latest and greatest version of the code.
3. Extract the downloaded zip file into a suitable location (for example `d:\tools\butler-sheet-icons` on a Windows Server, then go to the `src` directory.
4. Run `npm install` to download and install all dependencies.
5. Start BSI with `node butler-sheet-icons.js <options>`.

# Configuration

## QS Cloud

To use Butler Sheet Icons with QS Cloud you must first set some things up:

### Create API Key

Butler Sheet Icons accesses the QS Cloud APIs to get information about the apps that should be updated. This access assumes an API token has been created.

There is a good [tutorial on qlik.dev](https://qlik.dev/tutorials/generate-your-first-api-key) that describes how to create API keys.

## Client-managed QSEoW

### Certificates

When using Butler Sheet Icons (BSI) with QSEoW you must first export certificates from the QMC. BSI will use those certificates to authenticate with the QSEoW APIs.

Instructions for exporting the certificates are available on [Qlik's help pages](https://help.qlik.com/en-US/sense-admin/February2022/Subsystems/DeployAdministerQSE/Content/Sense_DeployAdminister/QSEoW/Administer_QSEoW/Managing_QSEoW/export-certificates.htm).

Once you have the `client.pem` and `client_key.pem` files you should store them some place where BSI can access them. The `--certfile` and `--certkeyfile` options are used to tell BSI where the files are stored.

The default location (which will be used if `--certfile` or `--certkeyfile` are not specified) where BSI will look for the certificates is in a directory called `cert` directly under the directory in which BSI was started.

Using PowerShell:

```powershell
PS C:\tools\butler-sheet-icons-butler-sheet-icons> dir

    Directory: C:\tools\butler-sheet-icons-butler-sheet-icons


Mode                 LastWriteTime         Length  Name
----                 -------------         ------  ----
d-----        13/03/2022     14:44                 cert
d-----        14/03/2022     12:45      121249744  butler-sheet-icons.exe


PS C:\tools\butler-sheet-icons-butler-sheet-icons>
PS C:\tools\butler-sheet-icons-butler-sheet-icons> dir cert

    Directory: C:\tools\butler-sheet-icons-butler-sheet-icons\cert


Mode                LastWriteTime         Length Name
----                -------------         ------ ----
-a----       07/03/2021     12:41           1170 client.pem
-a----       07/03/2021     12:41           1706 client_key.pem


PS C:\tools\butler-sheet-icons-butler-sheet-icons>

```

### Content Libraries

Butler Sheet Icons (BSI) will create image thumbnails for all sheets in a QSEoW application, then upload those images to a Sense content library.

**That content library must exist before Butler Sheet Icons is executed!!**

If not told otherwise by means of the `--contentlibrary` option, BSI will try to upload the images to a content library called "Butler sheet thumbnails".

# Concepts

## Concepts Shared Between QS Cloud and Client-managed QS

### Logging

Logging is controlled by the `--loglevel` option.  
`--log-level` is an alias for `--loglevel`.

Valid values are (in order of increasing verbosity): `error`, `warning`, `info`, `verbose`, `debug`, `silly`.

When using log level `silly` all websocket communication to/from the Sense server will be logged to the console.  
This will give you _very_ detailed logging, but this can be useful when investigating bugs or other issues.

Default logging level is `info`.

### Hidden Sheets Never Updated

If a sheet is hidden in a Qlik Sense app, Butler Sheet Icons will not update the sheet's thumbnail image.

In QSEoW it is possible to hide sheets by using the "Hide sheet" option in the sheet's properties, whereas this is currently not possible in QS Cloud.  
Still, Butler Sheet Icons handles hidden sheets the same way in both QSEoW and QS Cloud.

### Which Part of Each Sheet to Use as Thumbnail

A sheet in a standard Qlik Sense application consists of several parts.  
Starting at the bottom of the screen we have:

1. The main part of the sheet. This is where tables, charts, etc., are shown.
2. A sheet title.
3. A selection bar. Shows what selections are currently made in the app.
4. A menu bar. Here we find the main menu to the left, the app name, a drop-down menu showing all sheets, etc.

Butler Sheet Icons lets you control which part of each sheet will be used as the thumbnail for that sheet.

The parameter `--includesheetpart` is used to control this.  
The allowed values are:

1: The main sheet area only. I.e., no sheet title, selection bar, or menu bar.  
2: Same as 1 but with sheet title added.  
3: Same as 2 but with selection bar added.  
4: Same as 3 but with menu bar added, i.e., the entire page.

Looking at a sheet in client-managed QS we have:

![Using different parts of Sense sheet's as thumbnails](./docs/img/create-qseow_sheetpart_1.png "Using different parts of Sense sheet's as thumbnails")

`--includesheetpart` is an optional parameter with a default value of 1.

### Excluding Sheets

- The `--exclude-sheet-number`, `--exclude-sheet-title` and `--exclude-sheet-status` options are available for both QS Cloud apps and client-managed QS apps.
- The `--exclude-sheet-tag` option is only available for client-managed QS, as there is no way to tag individual sheets in QS Cloud.

`--exclude-sheet-number`, `--exclude-sheet-title` and `--exclude-sheet-status` options all take one or more parameters:

```bash
--exclude-sheet-number 3 7
--exclude-sheet-title Intro "Metrics definitions" Help
--exclude-sheet-status published private
```

Note above how option parameters (in this case sheet titles) with spaces must be enclosed in double quotes.

There can be various reasons why you want to exclude sheets from getting new icons.

One scenario could be that some sheets have special roles in apps, for example providing help/support info or giving an overview of the entire app.  
Another scenario is that a company has standardized on a fixed format first sheet in each app and wants that sheet's icon to be the same everywhere (i.e., not be a miniature of what's actually shown on that sheet).

On client-managed Qlik Sense Enterprise there is an additional option too: `--exclude-sheet-tag`.

Follow these steps to use that option:

1. Create a tag in the QMC. For example `❌excludeSheetThumbnailUpdate`. Emojis can be used in Qlik Sense tags - quite useful!
2. Use the QMC's App Objects section to tag the sheets that should _not_ get new sheet icons, using that new tag.
3. When starting Butler Sheet Icons you should pass in the option `--exclude-sheet-tag "❌excludeSheetThumbnailUpdate"`.

Tagged sheets will be excluded from getting new sheet icons.

### Excluding Sheets Based on the Sheet's Status

The `--exclude-sheet-status` is available for both QSEoW and QS Cloud, but works slightly differently between the two.

- For QS Cloud:
  - Any sheet icon (private, published, and public sheets) belonging to _unpublished_ apps can be updated by Butler Sheet Icons.
  - Only icons associated with _private_ sheets can be updated in _published_ apps.
- For QSEoW:
  - All sheet icons for all sheets in both unpublished and published apps can be updated by Butler Sheet Icons.

The following table shows which sheets can be updated by Butler Sheet Icons:

|             | QS Cloud                       | QSEoW                          |
| ----------- | ------------------------------ | ------------------------------ |
| Published   | Private                        | Public<br>Published<br>Private |
| Unpublished | Public<br>Published<br>Private | Public<br>Published<br>Private |

For example, if updating a published app in QS Cloud, the `--exclude-sheet-status public published` option should be used to exclude public and public sheets from getting new sheet icons. Failing to do so will result in an error message:

![ Access denied when trying to update public or published sheet icons in QS Cloud ](docs/img/butler-sheet-icons-qscloud-access-denied_1.png "Access denied when trying to update public or published sheet icons in QS Cloud")

### Blurring Sheet Icons

Butler Sheet Icons can create blurred versions of the sheet icons.  
This can be useful when sheets contain sensitive information that should not be visible in the sheet thumbnails.

Blurring of images works much like the `--exclude-sheet-...` options.
The same options are available, but with `--blur-sheet-...` as the prefix.

Sheet blurring is available both for QS Cloud and client-managed QSEoW.

Note that blurred images are created for all sheets and stored on disk just as the regular sheet thumbnail images.  
If an app sheet matches the filter criteria specified via `--blur-sheet-....` command line options, the blurred image will be used as the sheet icon.

### Screenshots Taken by Butler Sheet Icons

Image files are created (=screenshots are taken):

- Login page _before_ user credentials have been entered: `loginpage-1.png`
- Login page _after_ user credentials have been entered: `loginpage-2.png`
- App overview _before_ thumbnails have been updated: `overview-1.png`
- Each sheet in all apps that are processed.
  - Separate directories for QS Cloud and QSEoW screenshots.
  - Within those separate directories, each app has its own subdirectory.
  - Blurred images are stored with a `-blurred` suffix in the file name.

Example:

```
img
├── cloud
│   └── 97089caf-f386-454e-9b9a-726aa89f5e88
│       ├── loginpage-1.png
│       ├── loginpage-2.png
│       ├── overview-1.png
│       ├── thumbnail-1-blurred.png
│       ├── thumbnail-1.png
│       ├── thumbnail-3-blurred.png
│       ├── thumbnail-3.png
│       ├── thumbnail-4-blurred.png
│       └── thumbnail-4.png
└── qseow
    └── a3e0f5d2-000a-464f-998d-33d333b175d7
        ├── loginpage-1.png
        ├── loginpage-2.png
        ├── overview-1.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-2-blurred.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-2.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-3-blurred.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-3.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-4-blurred.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-4.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-7-blurred.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-7.png
        ├── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-8-blurred.png
        └── thumbnail-a3e0f5d2-000a-464f-998d-33d333b175d7-8.png
```

### Headless Browser

The `--headless` takes either `true` or `false` as a value (`true` is default).

Running "headless" means the browser is not visible on screen. It's running in the background, but isn't visible. Running headless is the normal way to use Butler Sheet Icons, but showing the embedded browser (i.e., using `--headless false`) can be useful to debug issues. Being able to see what happens on-screen when BSI is logging into Qlik Sense or trying to create screenshots can be **_very_** useful when trying to understand what's going on.

### Downloading a Browser

When running Butler Sheet Icons for the first time, a web browser needs to be downloaded.  
If not instructed otherwise, Butler Sheet Icons will download and install the latest version of the Chrome browser.

The `--browser` option can be used to specify which browser to use. Valid values are `chrome` and `firefox`.  
If you want to use a specific version of Chrome, you can specify that using the `--browser-version` option.

> Firefox does not support specifying a specific version, so `--browser-version latest` option will be automatically used when `--browser firefox` is specified.

Both `--browser` and `--browser-version` are optional parameters available when creating sheet icons for both QS Cloud and client-managed QSEoW.

More info is available in the [browser section](#the-browser-command).

### Using BSI with a Proxy Server

If you are behind a proxy server and cannot access the Internet directly, you need to specify the proxy server to use.
This can be done using environment variables `http_proxy`and `https_proxy`.

Example (on Windows/PowerShell):

```powershell
$env:http_proxy='http://username:password@proxy.example.com:port'
$env:https_proxy='http://username:password@proxy.example.com:port'
```

Example (on Linux/macOS):

```bash
export http_proxy='http://username:password@proxy.example.com:port'
export https_proxy='http://username:password@proxy.example.com:port'
```

## Concepts Specific to QS Cloud

### Logging into QS Cloud

QS Cloud is quite flexible when it comes to logging in, supporting both username/password and various Single Sign-On (SSO) solutions.

Butler Sheet Icons supports the username/password method, i.e., the method where you enter your username and password in a web form.  
Let's say you have a URL to a Sense app in QS Cloud: `https://mytenant.eu.qlikcloud.com/sense/app/25dd1bf9-bc47-47c7-8ed1-16e198b26096/hubUrl/%2Fhub`

Opening this URL in a clean browser page (i.e., a browser where you are not already logged in to QS Cloud) will show a login page like the one below.  
Do note that this page changes appearance every now and then - what is shown below is how the login page looked in late April 2024.

![Login page in Qlik Sense Cloud](./docs/img/qscloud-loginpage_1.png "Login page in Qlik Sense Cloud")

The email/username and password entered here should be present in the QMC's user management section.  
The same is true for the username and password used when starting BSI (using the `--logonuserid` and `--logonpwd` options) - these credentials must also be present in the QMC.

### Skipping the Login Page

If your company has a Single Sign-On (SSO) solution in place, you may never see the QS Cloud login page, but instead arrive directly at the app overview page.
BSI will by default wait for the QS Cloud login page to be fully loaded before proceeding - which will never happen in this case.

We're entering somewhat deep water here, as there are many variants of SSO out there.  
You can however try to use the `--skip-login` option (introduced in BSI 3.6.0) to tell BSI to skip the login page altogether.  
This may or may not work for you, depending on how your company's SSO solution is set up.

Note: The `--skip-login` option is a beta feature and is subject to change in coming versions of BSI.

## Concepts Specific to Client-managed QS (QSEoW)

### Which Version is the Sense Server Using

Different QSEoW versions may (will!) have different HTML code in the Hub's and apps' user interface.  
As BSI pretends to be a user accessing Sense, BSI needs to adapt to each Sense version.

The solution is to use the `--sense-version` command line parameter to specify which version your Sense server is running.  
The list of allowed values is available in the BSI help that's shown by running `.\butler-sheet-icons.exe qseow create-sheet-thumbnails --help` (on Windows/PowerShell in this case).

NOTE: The `--sense-version` parameter was added in BSI 3.0 and is a mandatory parameter!

### Login Method

QSEoW offers two different built-in ways to log in using username/pwd.  
These are set per virtual proxy in the "Windows authentication pattern" field. Valid options are `Windows` and `Form`.

When set to `Windows` and a user accesses the virtual proxy from a Windows computer, the user will get a login popup in which she enters username and password. On non-Windows computers, the user will instead see a web form.

When set to `Form` the user will _always_ see a web form in which username and password are entered:

![Using different parts of Sense sheet's as thumbnails](./docs/img/create-qseow-loginpage_1.png "Using different parts of Sense sheet's as thumbnails")

Butler Sheet Icons only supports the `Form` method.  
Thus, if you use BSI on Windows you should make sure to specify a virtual proxy (`--prefix` option) that uses `Form` authentication!

If the `--prefix` option is not specified when starting BSI, the default '/' virtual proxy will be used.

If you need to set up a new virtual proxy the following configuration may be useful - it is what each version of BSI is tested against:

![Virtual proxy using Forms-based authentication, part 1](./docs/img/qseow-virtualproxy_1.png "Virtual proxy using Forms-based authentication, part 1")

![Virtual proxy using Forms-based authentication, part 2](./docs/img/qseow-virtualproxy_2.png "Virtual proxy using Forms-based authentication, part 2")

Finally, don't forget to use the `--prefix form` parameter when starting BSI. That option simply tells BSI to use a virtual proxy called "form" when connecting to the Sense server.

### Using QSEoW's Built-in Node.js

It is possible, but in most cases not recommended to run Butler Sheet Icons as a Node.js app instead of using the stand-alone, pre-built Butler Sheet Icon binaries.

In this scenario it might be tempting to use the Node.js engine that ships with QSEoW.

While this might sound like a good idea, there are several reasons to stay away from it:

- QSEoW's bundled Node.js version is usually pretty old.
- You don't get the npm tool, which is needed to install the dependencies Butler Sheet Icons need (the `npm install` command).
  It may be possible to manually install npm and then use Sense's bundled Node version, but it's **_not_** recommended.

A better solution is to use the stand-alone Butler Sheet Icons binaries. They are built to work on all major operating systems and are tested against the most recent Long Term Support (LTS) version of Node.js.

# Commands

Run Butler Sheet Icons with the `--help` option to show available commands and options.  
This works for both top-level commands and sub-commands.

On Windows this would be `butler-sheet-icons.exe --help`.

```powershell
.\butler-sheet-icons.exe --help
```

```powershell
Usage: butler-sheet-icons [options] [command]

This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.
Qlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.
The created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  qseow
  qscloud
  browser
  help [command]  display help for command
```

## qseow

```powershell
.\butler-sheet-icons.exe qseow --help
```

```powershell
Usage: butler-sheet-icons qseow [options] [command]

Options:
  -h, --help                         display help for command

Commands:
  create-sheet-thumbnails [options]  Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.
                                     Multiple apps can be updated with a single command, using a Qlik Sense tag to identify  which apps will be updated.
  remove-sheet-icons [options]       Remove all sheet icons from a Qlik Sense Enterprise on Windows (QSEoW) app.
  help [command]                     display help for command
```

### create-sheet-thumbnails

The command assumes there is a standard form-based authentication page (username + password) available on the specified virtual proxy (which is specified using the `--prefix` option).

A complete session using this command is described [here](./docs/qseow-demo_1.md).

```powershell
.\butler-sheet-icons.exe qseow create-sheet-thumbnails --help
```

```powershell
Usage: butler-sheet-icons qseow create-sheet-thumbnails|create-sheet-icons [options]

Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.
Multiple apps can be updated with a single command, using a Qlik Sense tag to identify  which apps will be updated.

Options:
  --loglevel, --log-level <level>     log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --host <host>                       Qlik Sense server IP/FQDN
  --engineport <port>                 Qlik Sense server engine port (default: "4747")
  --qrsport <port>                    Qlik Sense server repository service (QRS) port (default: "4242")
  --port <port>                       Qlik Sense http/https port. 443 is default for https, 80 for http
  --schemaversion <string>            Qlik Sense engine schema version (default: "12.612.0")
  --appid <id>                        Qlik Sense app whose sheet icons should be modified. (default: "")
  --certfile <file>                   Qlik Sense certificate file (exported from QMC) (default: "./cert/client.pem")
  --certkeyfile <file>                Qlik Sense certificate key file (exported from QMC) (default: "./cert/client_key.pem")
  --rejectUnauthorized <true|false>   Ignore warnings when Sense certificate does not match the --host parameter (default: false)
  --prefix <prefix>                   Qlik Sense virtual proxy prefix (default: "")
  --secure <true|false>               connection to Qlik Sense engine is via https (default: true)
  --apiuserdir <directory>            user directory for user to connect with when using Sense APIs
  --apiuserid <userid>                user ID for user to connect with when using Sense APIs
  --logonuserdir <directory>          user directory for user to connect with when logging into web UI
  --logonuserid <userid>              user ID for user to connect with when logging into web UI
  --logonpwd <password>               password for user to connect with
  --headless <true|false>             headless (=not visible) browser (true, false) (default: true)
  --pagewait <seconds>                number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly (default: 5)
  --imagedir <directory>              directory in which thumbnail images will be stored. Relative or absolute path (default: "./img")
  --contentlibrary <library-name>     Qlik Sense content library to which thumbnails will be uploaded (default: "Butler sheet thumbnails")
  --includesheetpart <value>          which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3=2 + selection bar, 4=3 + menu bar (default: "1")
  --qliksensetag <value>              Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated. (default: "")
  --exclude-sheet-status <status...>  Exclude all sheets with specified status(es) (choices: "private", "published", "public", default: [])
  --exclude-sheet-tag <value...>      Sheets with one or more of these tags set will be excluded from sheet icon update.
  --exclude-sheet-number <number...>  Sheet numbers (1=first sheet in an app) that will be excluded from sheet icon update.
  --exclude-sheet-title <title...>    Use sheet titles to control which sheets that will be excluded from sheet icon update.
  --blur-sheet-status <status...>     Blur all sheets with specified status(es) (choices: "published", "public", default: [])
  --blur-sheet-tag <value>            Sheets with one or more of these tags set will be blurred in the sheet icon update.
  --blur-sheet-number <number...>     Sheet numbers (1=first sheet in an app) that will be blurred in the sheet icon update.
  --blur-sheet-title <title...>       Sheets with this title will be blurred in the sheet icon update.
  --blur-factor <factor>              Factor to blur the sheets with. 0 = no blur, 1000 = full blur. (default: "10")
  --sense-version <version>           Version of the QSEoW server to connect to (choices: "pre-2022-Nov", "2022-Nov", "2023-Feb", "2023-May", "2023-Aug", "2023-Nov", "2024-Feb", "2024-May", default: "2024-May")
  --browser <browser>                 Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. (choices: "chrome", "firefox", default: "chrome")
  --browser-version <version>         Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. Leave empty or set to "latest" to get latest available version.
  -h, --help                          display help for command
```

### remove-sheet-icons

This command uses the Qlik Sense APIs to remove all sheet icons from one or more apps.

The options to this command are a subset of the options for the `qseow create-sheet-thumbnails` command:

```powershell
.\butler-sheet-icons.exe qseow remove-sheet-icons --help
```

```powershell
Usage: butler-sheet-icons qseow remove-sheet-icons|remove-sheet-thumbnails [options]

Remove all sheet icons from a Qlik Sense Enterprise on Windows (QSEoW) app.

Options:
  --loglevel, --log-level <level>    log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --host <host>                      Qlik Sense server IP/FQDN
  --engineport <port>                Qlik Sense server engine port (default: "4747")
  --qrsport <port>                   Qlik Sense server repository service (QRS) port (default: "4242")
  --port <port>                      Qlik Sense http/https port. 443 is default for https, 80 for http
  --schemaversion <string>           Qlik Sense engine schema version (default: "12.612.0")
  --appid <id>                       Qlik Sense app whose sheet icons should be modified. (default: "")
  --certfile <file>                  Qlik Sense certificate file (exported from QMC) (default: "./cert/client.pem")
  --certkeyfile <file>               Qlik Sense certificate key file (exported from QMC) (default: "./cert/client_key.pem")
  --rejectUnauthorized <true|false>  Ignore warnings when Sense certificate does not match the --host parameter (default: false)
  --prefix <prefix>                  Qlik Sense virtual proxy prefix (default: "")
  --secure <true|false>              connection to Qlik Sense engine is via https (default: true)
  --apiuserdir <directory>           user directory for user to connect with when using Sense APIs
  --apiuserid <userid>               user ID for user to connect with when using Sense APIs
  --qliksensetag <value>             Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated. (default: "")
  -h, --help                         display help for command
```

## qscloud

```powershell
.\butler-sheet-icons.exe qscloud --help
```

```powershell
Usage: butler-sheet-icons qscloud [options] [command]

Options:
  -h, --help                                            display help for command

Commands:
  create-sheet-thumbnails|create-sheet-icons [options]  Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.
                                                        Multiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.
  list-collections [options]                            List available collections.
  remove-sheet-icons|remove-sheet-thumbnails [options]  Remove all sheet icons from a Qlik Sense Cloud app.
  help [command]                                        display help for command
```

### create-sheet-thumbnails

```powershell
.\butler-sheet-icons.exe qscloud create-sheet-thumbnails --help
```

```powershell
Usage: butler-sheet-icons qscloud [options] [command]

Options:
  -h, --help                                            display help for command

Commands:
  create-sheet-thumbnails|create-sheet-icons [options]  Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.
                                                        Multiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.
  list-collections [options]                            List available collections.
  remove-sheet-icons|remove-sheet-thumbnails [options]  Remove all sheet icons from a Qlik Sense Cloud app.
  help [command]                                        display help for command
PS /Users/goran/code/butler-sheet-icons/src> node ./butler-sheet-icons.js qscloud create-sheet-thumbnails --help
Usage: butler-sheet-icons qscloud create-sheet-thumbnails|create-sheet-icons [options]

Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.
Multiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.

Options:
  --loglevel, --log-level <level>     log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --schemaversion <string>            Qlik Sense engine schema version (default: "12.612.0")
  --tenanturl <url>                   URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"
  --apikey <key>                      API key used to access the Sense APIs
  --skip-login                        skip QS login page, go directly to the tenant URL. Use this if you are automatically logged in to Qlik Sense (default: false)
  --logonuserid <userid>              user ID for user to connect with when logging into web UI
  --logonpwd <password>               password for user to connect with
  --headless <true|false>             headless (=not visible) browser (true, false) (default: true)
  --pagewait <seconds>                number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly (default: 5)
  --imagedir <directory>              directory in which thumbnail images will be stored. Relative or absolute path (default: "./img")
  --includesheetpart <value>          which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3 not used, 4=full screen (choices: "1", "2", "4", default: "1")
  --appid <id>                        Qlik Sense app whose sheet icons should be modified.
  --collectionid <id>                 Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated (default: "")
  --exclude-sheet-status <status...>  Exclude all sheets with specified status(es) (choices: "private", "published", "public", default: [])
  --exclude-sheet-number <number...>  Sheet numbers (1=first sheet in an app) that will be excluded from sheet icon update.
  --exclude-sheet-title <title...>    Use sheet titles to control which sheets that will be excluded from sheet icon update.
  --blur-sheet-status <status...>     Blur all sheets with specified status(es) (choices: "published", "public", default: [])
  --blur-sheet-number <number...>     Sheet numbers (1=first sheet in an app) that will be blurred in the sheet icon update.
  --blur-sheet-title <title...>       Sheets with this title will be blurred in the sheet icon update.
  --blur-factor <factor>              Factor to blur the sheets with. 0 = no blur, 1000 = full blur. (default: "10")
  --browser <browser>                 Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. (choices: "chrome", "firefox", default: "chrome")
  --browser-version <version>         Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. Leave empty or set to "latest" to get latest available version.
  -h, --help                          display help for command
```

### list-collections

```powershell
.\butler-sheet-icons.exe qscloud list-collections --help
```

```powershell
Usage: butler-sheet-icons qscloud list-collections [options]

List available collections.

Options:
  --loglevel, --log-level <level>  log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --tenanturl <url>                URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"
  --apikey <key>                   API key used to access the Sense APIs
  --outputformat <table|json>      Output format (choices: "table", "json", default: "table")
  -h, --help                       display help for command
```

### remove-sheet-icons

This command uses the Qlik Sense APIs to remove all sheet icons from one or more apps.

The options to this command are a subset of the options for the `qseow create-sheet-thumbnails` command:

```powershell
.\butler-sheet-icons.exe qscloud remove-sheet-icons --help
```

```powershell
Usage: butler-sheet-icons qscloud remove-sheet-icons [options]

Remove all sheet icons from a Qlik Sense Cloud app.

Options:
  --loglevel <level>        log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --schemaversion <string>  Qlik Sense engine schema version (default: "12.612.0")
  --tenanturl <url>         URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"
  --apikey <key>            API key used to access the Sense APIs
  --appid <id>              Qlik Sense app whose sheet icons should be modified.
  --collectionid <id>       Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated
                            (default: "")
  -h, --help                display help for command
```

## browser

BSI has a command called `browser`. This command can be used to download, install, and in other ways control which browser(s) are available to Butler Sheet Icons.

Using the `browser` command is only needed in very specific scenarios, for example when you want to use a specific version of Chrome or Firefox to capture sheet thumbnails.

On Windows:

```powershell
.\butler-sheet-icons.exe browser --help
```

```powershell
Usage: butler-sheet-icons browser [options] [command]

Options:
  -h, --help                display help for command

Commands:
  list-installed [options]  Show which browsers are currently installed and available for use by Butler Sheet Icons.
  uninstall [options]       Uninstall a browser from the Butler Sheet Icons cache.
                            This will remove the browser from the cache, but will not affect other browsers on this computer.
                            Use the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.
  uninstall-all [options]   Uninstall all browsers from the Butler Sheet Icons cache.
                            This will remove all browsers from the cache, but will not affect other browsers on this computer.
                            Use the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.
  install [options]         Install a browser into the Butler Sheet Icons cache.
                            This will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.
                            Use the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.
  list-available [options]  Show which browsers are available for download and installation by Butler Sheet Icons.
  help [command]            display help for command
```

### list-installed

List what browsers are currently installed and available for use by Butler Sheet Icons.

Note that this command only lists browsers that have been installed by Butler Sheet Icons - not browsers installed by other means.  
 In other words: Butler Sheet Icons uses its own cache of browsers, it does not use browsers installed on the computer in any other way.

On Windows:

```powershell
.\butler-sheet-icons.exe browser list-installed --help
```

```powershell
Usage: butler-sheet-icons browser list-installed [options]

Show which browsers are currently installed and available for use by Butler Sheet Icons.

Options:
  --loglevel, --log-level <level>  log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  -h, --help                       display help for command
```

### uninstall

Uninstall a browser from the Butler Sheet Icons cache.

This will remove the browser from the cache, but will not affect other browsers on this computer.

```powershell
.\butler-sheet-icons.exe browser uninstall --help
```

```powershell
Usage: butler-sheet-icons browser uninstall [options]

Uninstall a browser from the Butler Sheet Icons cache.
This will remove the browser from the cache, but will not affect other browsers on this computer.
Use the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.

Options:
  --loglevel, --log-level <level>  log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --browser <browser>              Browser to uninstall (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. (default: "chrome")
  --browser-version <version>      Version (=build id) of the browser to uninstall. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.
  -h, --help                       display help for command
```

### uninstall-all

Uninstall all browsers from the Butler Sheet Icons cache.  
This will remove all browsers from the cache, but will not affect other browsers on this computer.

On Windows:

```powershell
.\butler-sheet-icons.exe browser uninstall-all --help
```

```powershell
Usage: butler-sheet-icons browser uninstall-all [options]

Uninstall all browsers from the Butler Sheet Icons cache.
This will remove all browsers from the cache, but will not affect other browsers on this computer.
Use the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.

Options:
  --loglevel, --log-level <level>  log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  -h, --help                       display help for command
```

### install

Install a browser into the Butler Sheet Icons cache.  
This will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.

On Windows:

```powershell
.\butler-sheet-icons.exe browser install --help
```

```powershell
Usage: butler-sheet-icons browser install [options]

Install a browser into the Butler Sheet Icons cache.
This will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.
Use the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.

Options:
  --loglevel, --log-level <level>  log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --browser <browser>              Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. (choices: "chrome", "firefox", default: "chrome")
  --browser-version <version>      Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. (default: "latest")
  -h, --help                       display help for command
```

#### Older Versions of Chrome

If using the command `browser list-available --browser chrome` you will see that there are several versions of Chrome available for download.  
If you then try to install an older version of Chrome it seems the Chrome team has removed the ability to download at least some older versions of Chrome.

The output would look like this in PowerShell on Windows:

```powershell
.\butler-sheet-icons.exe browser install --browser chrome --browser-version 109.0.5414.74
2023-07-27T05:34:35.117Z info: Resolved browser build id: "109.0.5414.74" for browser "chrome" version "109.0.5414.74"
2023-07-27T05:34:35.119Z info: Installing browser...
2023-07-27T05:34:35.582Z error: Browser version "109.0.5414.74" not found
2023-07-27T05:34:35.582Z error: MAIN browser install: Error: Download failed: server returned code 404. URL: https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/109.0.5414.74/linux64/chrome-linux64.zip
```

There really isn't much to do about this, other than to use a newer version of Chrome.

#### Older Versions of Firefox

Support for specific Firefox versions is pending, for now only the latest version of Firefox is supported.

Simply use the `--browser firefox` option to install the latest version of Firefox.  
Using `--browser firefox --browser-version latest ` will achieve the same result.

### list-available

List which browsers are available online for download and installation by Butler Sheet Icons.

BSI supports Chrome and Firefox, use the `--browser` option to specify which browser's availability you want to list.  
If using Chrome you can use the `--channel` option to specify which Chrome release channel (`stable`, `beta`, `dev`, `canary`) you want to list.

BSI will detect what operating system it's running on and only list browser versions that are available for that OS.

There are not many options to this command, on Windows:

```powershell
.\butler-sheet-icons.exe browser list-available --help
```

```powershell
Usage: butler-sheet-icons browser list-available [options]

Show which browsers are available for download and installation by Butler Sheet Icons.

Options:
  --loglevel, --log-level <level>  log level (choices: "error", "warn", "info", "verbose", "debug", "silly", default: "info")
  --browser <browser>              Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed. (choices: "chrome", "firefox", default: "chrome")
  --channel <browser>              Which of the browser's release channel versions should be listed?
   This option is only used for Chrome. (choices: "stable", "beta", "dev", "canary", default: "stable")
  -h, --help                       display help for command
```

# Hands-on Examples

The examples below show how BSI can be used in various situations.

Some examples are on PowerShell in Windows, some are on cmd in Windows.  
Others might be on PowerShell in macOS (yes [it exists](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-macos?view=powershell-7.3) - and is quite good!) or bash on macOS.  
Docker might show up too.

The key thing to remember is:

> The commands, sub-commands, and options are _identical_ no matter what underlying OS or platform is used to run Butler Sheet Icons.

## QS Cloud, Update a Single App + Apps in Collection

Using PowerShell on Windows Server 2016, with most parameters stored in PowerShell variables.

`.\butler-sheet-icons.exe qscloud create-sheet-thumbnails --tenanturl $env:BSI_CLOUD_TENANT_URL --collectionid $env:BSI_CLOUD_COLLECTION_ID --apikey $env:BSI_CLOUD_API_KEY --logonuserid $env:BSI_CLOUD_LOGON_USERID --logonpwd $env:BSI_CLOUD_LOGON_PWD --pagewait 5 --imagedir ./img --includesheetpart 4 --exclude-sheet-number 2 --exclude-sheet-title Sheet 3 --loglevel info --headless true --appid $env:BSI_CLOUD_APP_ID`

![Create thumbnails in QS Cloud](./docs/img/qscloud-create-thumbnails-winssrv2016-ps-1.png "Create thumbnails in QS Cloud")

Note that many of the options used above (e.g., `--loglevel info`) have their default values, and could thus be omitted to shorten the command a bit.

## QS Cloud, List All Available Collections

Using bash on macOS:

`./butler-sheet-icons qscloud list-collections --tenanturl $BSI_CLOUD_TENANT_URL --apikey $BSI_CLOUD_API_KEY --outputformat table`

![List available collections in QS Cloud](./docs/img/qscloud-list-collection-macos-bash-1.png "List available collections in QS Cloud")

Here we're showing the collections in a table, but it's also possible to get them as JSON by changing the last option to `--outputformat json`.

## Client-managed/QSEoW, Update a Single App + Apps with a Certain Tag, Exclude Some Sheets

Running the command will:

1. Create new sheet icons for all sheets in:
   1. the app with app ID stored in the BSI_APP_ID environment variable. Sample app ID: `a3e0f5d2-000a-464f-998d-33d333b175d7`.
   2. all apps with the tag `👍😎 updateSheetThumbnail` set.
2. Exclude some sheets (i.e., don't create thumbnails for them):
   1. all sheets named `Intro`, `Definitions`, or `Help`.
   2. sheets with position `1` or `10`.
   3. all sheets tagged with the tag `❌excludeSheetThumbnailUpdate` set.
3. Create thumbnail images in the `./img` directory (specified by the `--imagedir` option).
4. Each screenshot will include the main sheet area and the title row above it (`--includesheetpart 2`).
5. Upload the sheet thumbnails to the content library specified in the `--contentlibrary` option.
6. Each sheet's icon is updated with the corresponding image in the content library.

Running in bash on macOS with most parameters are set in environment variables:

`./butler-sheet-icons qseow create-sheet-thumbnails --loglevel info --host $BSI_HOST --appid $BSI_APP_ID --apiuserdir 'Internal' --apiuserid sa_api --logonuserdir $BSI_LOGON_USER_DIR --logonuserid $BSI_LOGON_USER_ID --logonpwd $BSI_LOGON_PWD --contentlibrary $BSI_CONTENT_LIBRARY --pagewait 5 --secure true --imagedir ./img --certfile $BSI_CERT_FILE --certkeyfile $BSI_CERT_KEY_FILE --includesheetpart 2 --headless true --exclude-sheet-tag '❌excludeSheetThumbnailUpdate' --exclude-sheet-title 'Intro' 'Definitions' 'Help' --exclude-sheet-number 1 10  --qliksensetag "👍😎 updateSheetThumbnail"`

![Create QSEoW thumbnails on macOS](./docs/img/create-qseow-macos-bash-1.png "Create QSEoW thumbnails on macOS")

## QS Cloud, Docker Container, Show Help Text

Butler Sheet Icons is available as a Docker image. This can be useful if you use Docker or Kubernetes as part of a CI/CD pipeline.

The features, commands, and options available in the Docker version of BSI are exactly the same as what's available in the pre-built binaries.

When running BSI in a Docker container on macOS it looks like this when requesting the main help page.

```bash
➜  docker run -it --rm ptarmiganlabs/butler-sheet-icons:latest --help
Usage: butler-sheet-icons [options] [command]

This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.
Qlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.
The created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  qseow
  qscloud
  browser
  help [command]  display help for command
➜
```

If we pass in proper parameters we will get new sheet icons in the specified apps:

`docker run -it --name butler-sheet-icons -v /Users/goran/code/temp/img:/nodeapp/img -v /Users/goran/code/temp/cert:/nodeapp/cert --rm ptarmiganlabs/butler-sheet-icons:latest qseow create-sheet-thumbnails --loglevel info --host $BSI_HOST --appid $BSI_APP_ID --apiuserdir 'Internal' --apiuserid sa_api --logonuserdir $BSI_LOGON_USER_DIR --logonuserid $BSI_LOGON_USER_ID --logonpwd $BSI_LOGON_PWD --contentlibrary $BSI_CONTENT_LIBRARY --pagewait 5 --secure true --imagedir ./img --includesheetpart 2 --headless true --exclude-sheet-tag '❌excludeSheetThumbnailUpdate' --exclude-sheet-title 'Intro' 'Definitions' 'Help' --exclude-sheet-number 1 10 --qliksensetag "👍😎 updateSheetThumbnail"`

![Running Butler Sheet Icons using Docker, updating client-managed Sense app](./docs/img/qseow-create-thumbnails-docker-1.png "Running Butler Sheet Icons using Docker, updating client-managed Sense app")

Note: The command above assumes the certificates exported from QSEoW are available in `/Users/goran/code/temp/cert`.

## QS Cloud, Docker Container, Update a Single App + Apps in Collection

`docker run -it --name butler-sheet-icons -v /Users/goran/code/temp/img:/nodeapp/img -v /Users/goran/code/temp/cert:/nodeapp/cert --rm ptarmiganlabs/butler-sheet-icons:latest qscloud create-sheet-thumbnails --tenanturl $BSI_CLOUD_TENANT_URL --apikey $BSI_CLOUD_API_KEY --logonuserid $BSI_CLOUD_LOGON_USERID --logonpwd $BSI_CLOUD_LOGON_PWD --collectionid $BSI_CLOUD_COLLECTION_ID --headless true --includesheetpart 2 --appid $BSI_CLOUD_APP_ID --pagewait 10`

![Run Butler Sheet Icons in Docker, updating Qlik Sense Cloud apps](./docs/img/qscloud-create-thumbnails-docker-1.png "Run Butler Sheet Icons in Docker, updating Qlik Sense Cloud apps")

## List Installed Browsers

List what browsers are currently installed and available for use by Butler Sheet Icons.

Note that this command only lists browsers that have been installed by Butler Sheet Icons - not browsers installed by other means.  
In other words: Butler Sheet Icons uses its own cache of browsers, it does not use browsers installed on the computer in any other way.

On Windows this would be `butler-sheet-icons.exe browser list-installed`.

```powershell
PS C:\tools\butler-sheet-icons> .\butler-sheet-icons.exe browser list-installed
2024-02-16T14:10:55.141Z info: App version: 3.2.3
2024-02-16T14:10:55.141Z info: Installed browsers:
2024-02-16T14:10:55.156Z info:     chrome, build id=121.0.6167.85, platform=win64, path=C:\Users\goran\.cache\puppeteer\chrome\win64-121.0.6167.85
PS C:\tools\butler-sheet-icons>
```

## Install a Browser into the BSI Cache

This will download and install a specific version of a browser into BSI's browser cache, where it can be used by Butler Sheet Icons.

Use the `browser list-installed` command to see which browsers are currently installed.

Running the `install` command without any options will install the latest stable version of Chrome into the cache.

On macOS:

```bash
➜  butler-sheet-icons ./butler-sheet-icons browser install
2024-02-16T14:14:57.561Z info: App version: 3.2.3
2024-02-16T14:14:57.668Z info: Resolved browser build id: "121.0.6167.85" for browser "chrome" version "stable"
2024-02-16T14:14:57.712Z info: Installing browser...
2024-02-16T14:14:57.712Z info: Browser "chrome" version "121.0.6167.85" installed
➜  butler-sheet-icons
```

The same thing in PowerShell on Windows:

```powershell
PS C:\tools\butler-sheet-icons> .\butler-sheet-icons.exe browser install
2024-02-16T14:13:35.312Z info: App version: 3.2.3
2024-02-16T14:13:35.484Z info: Resolved browser build id: "121.0.6167.85" for browser "chrome" version "stable"
2024-02-16T14:13:35.562Z info: Installing browser...
2024-02-16T14:13:44.062Z info: Browser "chrome" version "121.0.6167.85" installed
PS C:\tools\butler-sheet-icons>
```

Firefox can be installed in the same way, just use `--browser firefox` instead of `--browser chrome`.  
Only the `latest` version of Firefox can be installed at this time.

On macOS:

```bash
➜  butler-sheet-icons ./butler-sheet-icons browser install --browser firefox --browser-version latest
2024-02-16T14:17:47.673Z info: App version: 3.2.3
2024-02-16T14:17:47.976Z info: Resolved browser build id: "124.0a1" for browser "firefox" version "latest"
2024-02-16T14:17:48.343Z info: Installing browser...
2024-02-16T14:19:06.845Z info: Browser "firefox" version "124.0a1" installed
➜  butler-sheet-icons
```

## Show What Browsers Are Available for Download and Use with BSI

BSI supports Chrome and Firefox, use the `--browser` option to specify which browser's availability you want to list.  
If using Chrome you can use the `--channel` option to specify which Chrome release channel (`stable`, `beta`, `dev`, `canary`) you want to list.

BSI will detect what operating system it's running on and only list browser versions that are available for that OS.

For example, showing available `stable` versions of Chrome for macOS:

```bash
➜  butler-sheet-icons ./butler-sheet-icons browser list-available --browser chrome --channel stable
2024-02-16T14:15:46.237Z info: App version: 3.2.3
2024-02-16T14:15:46.677Z info: Chrome versions from "stable" channel:
2024-02-16T14:15:49.320Z info:     121.0.6167.85, "chrome/platforms/mac/channels/stable/versions/121.0.6167.85"
2024-02-16T14:15:49.684Z info:     121.0.6167.75, "chrome/platforms/mac/channels/stable/versions/121.0.6167.75"
2024-02-16T14:15:52.633Z info:     120.0.6099.109, "chrome/platforms/mac/channels/stable/versions/120.0.6099.109"
2024-02-16T14:15:53.060Z info:     120.0.6099.71, "chrome/platforms/mac/channels/stable/versions/120.0.6099.71"
2024-02-16T14:15:53.545Z info:     120.0.6099.62, "chrome/platforms/mac/channels/stable/versions/120.0.6099.62"
2024-02-16T14:15:53.998Z info:     120.0.6099.56, "chrome/platforms/mac/channels/stable/versions/120.0.6099.56"
2024-02-16T14:15:54.968Z info:     119.0.6045.159, "chrome/platforms/mac/channels/stable/versions/119.0.6045.159"
2024-02-16T14:15:55.288Z info:     119.0.6045.123, "chrome/platforms/mac/channels/stable/versions/119.0.6045.123"
...
...
➜  tools
```

Note the build IDs (e.g., 121.0.6167.85) in the output.  
These are the IDs that should be used when installing a specific version of Chrome for use with BSI.

Firefox support is limited, only the `latest` version of Firefox is supported.  
Firefox does not have build IDs, instead it has more human-readable version numbers (e.g., 115.0.3).

## Uninstall a Browser from the BSI Cache

Uninstall a browser from the Butler Sheet Icons cache.

This will remove the browser from the cache, but will not affect other browsers on this computer.  
Use the `browser list-installed` command to see which browsers are currently installed.

Example on Windows:  
First list already installed browsers, then uninstall one of them. Finally list installed browsers again to verify that the uninstallation worked:

```powershell
PS C:\tools\butler-sheet-icons> .\butler-sheet-icons.exe browser list-installed
2024-02-16T14:24:20.096Z info: App version: 3.2.3
2024-02-16T14:24:20.112Z info: Installed browsers:
2024-02-16T14:24:20.112Z info:     chrome, build id=121.0.6167.85, platform=win64, path=C:\Users\goran\.cache\puppeteer\chrome\win64-121.0.6167.85
2024-02-16T14:24:20.112Z info:     firefox, build id=124.0a1, platform=win64, path=C:\Users\goran\.cache\puppeteer\firefox\win64-124.0a1
PS C:\tools\butler-sheet-icons>
PS C:\tools\butler-sheet-icons> .\butler-sheet-icons.exe browser uninstall --browser-version 121.0.6167.85
2024-02-16T14:26:39.018Z info: App version: 3.2.3
2024-02-16T14:26:39.018Z info: Starting browser uninstallation
2024-02-16T14:26:39.018Z info: Uninstalling browser: chrome, build id=121.0.6167.85, platform=win64, path=C:\Users\goran\.cache\puppeteer\chrome\win64-121.0.6167.85
2024-02-16T14:26:39.096Z info: Browser "chrome", version "121.0.6167.85" uninstalled.
PS C:\tools\butler-sheet-icons>
PS C:\tools\butler-sheet-icons> .\butler-sheet-icons.exe browser list-installed
2024-02-16T14:26:44.597Z info: App version: 3.2.3
2024-02-16T14:26:44.597Z info: Installed browsers:
2024-02-16T14:26:44.613Z info:     firefox, build id=124.0a1, platform=win64, path=C:\Users\goran\.cache\puppeteer\firefox\win64-124.0a1
PS C:\tools\butler-sheet-icons>
```

## Uninstall All Browsers from the BSI Cache

This will remove all browsers from the cache, but will not affect other browsers on this computer.

Example on macOS:  
First list installed browsers, then uninstall all of them. Finally list installed browsers again to verify that the uninstallation worked:

```bash
➜  butler-sheet-icons ./butler-sheet-icons browser list-installed
2024-02-16T14:27:20.425Z info: App version: 3.2.3
2024-02-16T14:27:20.427Z info: Installed browsers:
2024-02-16T14:27:20.428Z info:     chrome, build id=121.0.6167.85, platform=mac, path=/Users/goran/.cache/puppeteer/chrome/mac-121.0.6167.85
2024-02-16T14:27:20.428Z info:     firefox, build id=124.0a1, platform=mac, path=/Users/goran/.cache/puppeteer/firefox/mac-124.0a1
➜  butler-sheet-icons
➜  butler-sheet-icons ./butler-sheet-icons browser uninstall-all
2024-02-16T14:29:24.989Z info: App version: 3.2.3
2024-02-16T14:29:24.990Z info: Starting uninstallation of all browsers
2024-02-16T14:29:24.991Z info: Uninstalling 2 browsers:
2024-02-16T14:29:24.992Z info:     Starting uninstallation of "chrome", build id "121.0.6167.85", platform "mac", path "/Users/goran/.cache/puppeteer/chrome/mac-121.0.6167.85"
2024-02-16T14:29:25.880Z info:     Starting uninstallation of "firefox", build id "124.0a1", platform "mac", path "/Users/goran/.cache/puppeteer/firefox/mac-124.0a1"
2024-02-16T14:29:26.214Z info: Removing any remaining files and directories in the browser cache directory
2024-02-16T14:29:26.214Z info: Browser "chrome" (121.0.6167.85) uninstalled.
2024-02-16T14:29:26.214Z info: Browser "firefox" (124.0a1) uninstalled.
➜  butler-sheet-icons
➜  butler-sheet-icons ./butler-sheet-icons browser list-installed
2024-02-16T14:29:29.943Z info: App version: 3.2.3
2024-02-16T14:29:29.944Z info: No browsers installed
➜  butler-sheet-icons
```

# Supported Qlik Sense Versions

## Client-managed Qlik Sense (=Qlik Sense Enterprise on Windows)

| Version          | BSI version | Tested date  | Comment                            |
| ---------------- | ----------- | ------------ | ---------------------------------- |
| 2024-May IR      | 3.6.4       | 2024-Nov-6   | Use `--sense-version 2024-May`     |
| 2024-May IR      | 3.6.3       | 2024-Aug-23  | Use `--sense-version 2024-May`     |
| 2024-May IR      | 3.6.2       | 2024-Jun-3   | Use `--sense-version 2024-May`     |
| 2024-May IR      | 3.6.1       | 2024-Jun-2   | Use `--sense-version 2024-May`     |
| 2023-Nov patch 3 |             | 2024-Feb-16  | Use `--sense-version 2023-Nov`     |
| 2023-Aug patch 3 |             | 2023-Jan-04  | Use `--sense-version 2023-Aug`     |
| 2023-May patch 6 |             | 2023-Oct-06  | Use `--sense-version 2023-May`     |
| 2023-May IR      |             | 2023-July-24 | Use `--sense-version 2023-May`     |
| 2022-Nov patch 2 |             | 2023-Jan-3   | Use `--sense-version 2022-Nov`     |
| 2022-Aug patch 5 |             | 2023-Jan-2   | Use `--sense-version pre-2022-Nov` |
| 2022-May IR      |             | 2022-Sep-30  | Use `--sense-version pre-2022-Nov` |

## Qlik Sense Cloud

| Tested date  | BSI version | Comment                               |
| ------------ | ----------- | ------------------------------------- |
| 2024-Nov-6   | 3.6.4       | Works without issues                  |
| 2024-Aug-23  | 3.6.3       | Works without issues                  |
| 2024-Jun-3   | 3.6.2       | Works without issues                  |
| 2024-Jun-2   | 3.6.1       | Works without issues                  |
| 2024-Apr-24  | 3.5.0       | Works without issues                  |
| 2024-Apr-22  | 3.4.1       | Login page has changed, cannot log in |
| 2024-Mar-8   | 3.4.1       | Works without issues                  |
| 2024-Feb-16  | 3.2.3       | Works without issues                  |
| 2023-Dec-6   | 3.2.0       | Works without issues                  |
| 2023-Nov-7   | 3.1.0       | Works without issues                  |
| 2023-July-24 |             | Works without issues                  |
| 2023-July-9  |             | Works without issues                  |
| 2023-Jan-3   |             | Works without issues                  |
| 2022-Sep-30  |             | Works without issues                  |

# Testing

Whenever changes are made to Butler Sheet Icons the new version is automatically tested against both a real client-managed Qlik Sense server and a Qlik Sense Cloud tenant.

Tests are made on the following platforms and Node.js versions during the automated build process:

- Windows Server 2016
  - Latest available Node.js LTS (Long Term Support) version.
- Windows Server 2019
  - Latest available Node.js LTS (Long Term Support) version.
- MacOS Monterey
  - Intel x64
  - Latest available Node.js LTS version.

Manual tests are also frequently done on Windows 10 and macOS.

# Troubleshooting

## Common Issues

### Login Problems

- Ensure the correct username and password are used.
- Verify the virtual proxy settings for QSEoW.
- For QS Cloud, check if the API key is valid and has the necessary permissions.

### Certificate Errors

- Ensure the certificates are correctly exported from the QMC.
- Verify the paths to the certificate files in the command options.

### Browser Issues

- If the embedded browser fails to load, try reinstalling the browser using the `browser install` command.
- Ensure the correct browser version is specified.

### Sheet Exclusion

- Double-check the sheet exclusion parameters (`--exclude-sheet-title`, `--exclude-sheet-number`, etc.) for accuracy.

# Security and Disclosure

Butler Sheet Icons (=BSI) is open source and you have access to all source code.  
It is _your own_ responsibility to determine if BSI is suitable for _your_ use case.  
The creators of BSI, including Ptarmigan Labs, Göran Sander, or any other contributor, can and must never be held liable for past or future security issues of BSI.  
If you have security concerns or ideas around BSI, please get involved in the project and contribute to making it better!

> If you discover a serious bug with BSI that may pose a security problem, please disclose it confidentially to security@ptarmiganlabs.com first, so it can be assessed and hopefully fixed prior to being exploited. Please do not raise GitHub issues for security-related doubts or problems.

## Platform Specific Security Information

### Windows

The Windows version of Butler Sheet Icons is signed with a code signing certificate issued by Certum, issued to "Open Source Developer, Göran Sander".

![Butler Sheet Icons binary for Windows is signed](./docs/img/butler-sheet-icons-win-signing-certificate-1.png "Butler Sheet Icons binary for Windows is signed")

### macOS

The macOS version is signed and notarized by Apple's standard process.  
A warning may still be shown the first time the app is started. This is expected and normal.

# Contribution

## How to Contribute

- Fork the repository and create a pull request for your changes.
- Report issues or suggest features via the GitHub issue tracker.
- Join the discussion forums to share ideas and solutions.

## Guidelines

- Follow the coding standards and guidelines outlined in the repository.
- Ensure your changes are well-documented and tested.
- Respect the project's code of conduct.

---
