/*
README:

This script automates the reporting process by capturing the contents of the Google form
and storing them directly in the excel sheet, meanwhile sending a formatted report to the 
reporter's email address, which can be one-click forwarded to the associated WhatsApp group.

## Featuers included:

1. Capturing contents of Google form

On submission, contents of the Google form are concatenated into a long string for WhatsApp 
report purpose.

E.g. 
Question: "Work Description:"
Anwer: "1. Do something"

Would be concatenated to - 
"https://api.whatsapp.com/send?phone=&text=%0A*Work%20Description%3A*%20%0A1.%20Do%20something.%0A"

in which the question is bolded, and the answer remains as normal text. URI encoding is applied.

Note:
- Line breaks are also captured as line breaks in the report.
- When there's a question that requires long paragraph as answer, there are additional line breaks
inserted before the question, before the answer para, after the answer para, in order to make it 
more readable. 
- Image upload is formatted in the same way as long para questions, since each image name occulies one
new line in the formatted report.


2. Attaching images

Images are sent as attachments to the email so that the reporter can easily retrieve them.
Images should be named properly by the reporter before uploading. 


3. Checking the total size of images

Since the maximum attachment size to Gmail is 25MB, images will only be sent with the email if the 
total size does not exceed the limit.
If total size exceeds 25MB, the attachment will not be sent. A notice will be appended in the email
to remind the user to retain the photos in his/her phone and upload to SharePoint later.
The formatted report would still contain the names of the images whether or not the attachment is present. 


4. Sending email
An HTML email is sent from the administrater account that enabled this script (see instructions below on 
how to enbale) to the email address that the reporter inputs in the Google form.
The reporter will receive an email stating "Click here to forward to WhatsApp", where "here" is 
embedded with the hyperlink described in feature #1.
When the reporter clicks on the hyperlink, s/he will be redirected to WhatsApp with an option to choose a 
recipient to forward the formatted report to.


5. Deleting images
If the email can be sent successfully, with the images as attachment, this script will delete the images 
from the administrater's Google Drive. This is to ensure sustainable use of the storage space. 
However,the deleted images will stay in the administrater's trash bin. S/he will need to manually delete 
them from the trash bin when the images are confirmed present in SharePoint.



## How to enable this script: 

1. Copying this script to administrater's account.

Should the administrater wish to attach this script to his/her own Google form, s/he needs to:
First, make a copy of both this file ("Code.gs") and the authorization file ("appsscript.json") to 
the scipt editor of his/her own Google form.
If the "appsscript.json" file cannot be seen from the left panel, click on "View" -> "Show manifest file".


2. Creating the trigger.

In the administrater's script editor, click on "Edit" -> "Current project's triggers".
S/he will be redirected to another page to create the trigger.
When creating the trigger, choose the function "onFormSubmit()", choose form submission as the triggering event.

It is best to make sure that the administrater has an active GMail mailbox, so that s/he can view the emails 
sent to reporters in his/her "sent" mailbox. 
Nonetheless, Google will still use "maestro.bounces.google.com" to send the email on the administrater's behalf 
if s/he does not have a GMail mailbox. 


*/

//function dateToString(date) {
//  var formattedDate = Utilities.formatDate(date, "Asia/Hong_Kong", "yyyy-MM-dd'T'HH:mm:ss'Z'");
//  Logger.log(formattedDate);
//  return formattedDate;
//}

function getWhatsAppLink(string) {
  return 'https://api.whatsapp.com/send?phone=&text=' + string;
}

// Returns a dictionary of 
// { "AnswerString": String,
//   "ImageIDs": String[]}
// Where the AnswerString is used to send the report (which also contains the image names),
// ImageIDs are used to retrive the image files
function processResponses(itemResponses) {
  var lastQuestionIsPara = false;
  var imageIDs = [];
  for (i = 0, len = itemResponses.length, concatenatedString = ""; i < len; i++) {
    
    var answerString = "";
    
    if (itemResponses[i].getItem().getType() == "FILE_UPLOAD") {
      var currResponse = itemResponses[i].getResponse();
      for (j = 0; j < currResponse.length; j++) {
        var imageID = currResponse[j];
        imageIDs.push(imageID);
        var file = DriveApp.getFileById(imageID);
        var fileName = file.getName();
        fileName = fileName.split(" - ")[0]; // remove the user name that Google appends to the file name
        file.setName(fileName); // rename the file to remove user name
        answerString += fileName + "\n"; // each image file name starts on a new line
      }
    }
    else {
      answerString = itemResponses[i].getResponse();
    }
    
    var questionString = itemResponses[i].getItem().getTitle();
    var questionType = itemResponses[i].getItem().getType();
    
    // Add a blank line before long para question, 
    // if there isn't already one (due to the previous question being a long para question)
    if ((questionType == FormApp.ItemType.PARAGRAPH_TEXT || questionType == "FILE_UPLOAD") && !lastQuestionIsPara) {
      concatenatedString += "%0A"; // line break
    }
    
    concatenatedString += encodeURIComponent("*" + questionString + "* ");
    
    // Add a line break before long para response
    if (questionType == FormApp.ItemType.PARAGRAPH_TEXT || questionType == "FILE_UPLOAD") {
      concatenatedString += "%0A"; // line break
    }
    
    concatenatedString += encodeURIComponent(answerString);
    
    // Add another line break after long para response
    if (questionType == FormApp.ItemType.PARAGRAPH_TEXT || questionType == "FILE_UPLOAD") {
      concatenatedString += "%0A"; // line break
      lastQuestionIsPara = true;
    }
    else lastQuestionIsPara = false;
    
    // Add a line break after the whole answer
    if (i < len - 1) {
      concatenatedString += "%0A"; // line break
    }
  }
  
  Logger.log("Concatenated answer string: %s", concatenatedString);   // Logging for debug purpose           
  Logger.log("Image IDs: %s", imageIDs);   // Logging for debug purpose                                              
  
  var processedResponses = {"AnswerString": concatenatedString, "ImageIDs": imageIDs};
  
  return processedResponses;
}

function getImagesFromImageIDs(imageIDs) {
  if (imageIDs == null) return null;
  var images = [];
  for (i = 0; i < imageIDs.length; i++) {
    var imageID = imageIDs[i];
    var file = DriveApp.getFileById(imageID);
    images.push(file.getBlob());
  }
  return images;
}

function getGmailMessage(recipient, subject, answerString, imageIDs, sizeLimitExceeded) {
  var htmlBody = "Click <a href=" + getWhatsAppLink(answerString) + ">here</a> to Send to WhatsApp. <br>";
  if (sizeLimitExceeded) {
    htmlBody += "Your images have exceeded the maximum size of 25MB and therefore could not be attached to this email. <br>";
    htmlBody += "Please retain the images in your phone and upload directly to SharePoint.";
    imageIDs = null;
  }
  var message = {
    to: recipient,
    subject: subject,
    htmlBody: htmlBody, 
    name: "Automatic Emailer Script",
    attachments: getImagesFromImageIDs(imageIDs)
  };
  return message;
}

// This function deletes the images that were uploaded with the current form
// Input: a String[] of image IDs 
function deleteImages(imageIDs) {
  if (imageIDs == null) return;
  for (i = 0; i < imageIDs.length; i++) {
    var imageID = imageIDs[i];
    var file = DriveApp.getFileById(imageID);
    file.setTrashed(true);  // deletes file
  }
}

// This function returns true if the total size of images is within the limit
function isWithinSizeLimit(imageIDs, maxMB) {
  if (imageIDs == null) return true;
  var maxByte = maxMB * 1024 * 1024;
  var totalByte = 0;
  for (i = 0; i < imageIDs.length; i++) {
    var imageID = imageIDs[i];
    var file = DriveApp.getFileById(imageID);
    totalByte += file.getSize();
  }
  return totalByte < maxByte;
}

function onFormSubmit(e) {
  var formResponse = e.response;
  // If all questions are required, getItemResponses returns responses in form-order
  var itemResponses = formResponse.getItemResponses();
  var email = formResponse.getRespondentEmail();
  Logger.log("email: %s", email);
  var imageIDs = null;
  
  try {
    var processedResponses = processResponses(itemResponses);
    var answerString = processedResponses["AnswerString"];
    imageIDs = processedResponses["ImageIDs"];
    var subject = "WhatsApp Link for Formatted Report";
    var sizeLimitExceeded = !isWithinSizeLimit(imageIDs, 25); // Check if images are within 25MB total size
    var message = getGmailMessage(email, subject, answerString, imageIDs, sizeLimitExceeded);
    
    MailApp.sendEmail(message);
    Logger.log("The following email is successfully sent: %s", message);
    
    if (!sizeLimitExceeded) {
      deleteImages(imageIDs);
      Logger.log("Deleted the following images: %s", imageIDs);
    }
  }
  catch (error) {
    Logger.log("Error when sending email! Error message: %s", error.message);
  }
}
