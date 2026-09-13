let SCREEN_WIDTH = 600;
let SCREEN_HEIGHT = 600;
let DISC_DIAMETER = 450;
const DOT_DIAMETER = 10;
const TEXT_OFFSET = 1.09;
const BEZI_SCALE = 0.7;
const M = 500; // Number of samples in the curve
const DISC_SIZE_RATIO = 0.75;
const PHI = (1 + Math.sqrt(5))/2;
let centreOfScreen;
let partField = null;
let submitButton = null;
let isTyping = false;
let outer_p = 8;
let inner_q = 5;


let annularRadio; 



function getCanvasTargetSize() {
  const size = Math.min(windowWidth, windowHeight);
  return size > 0 ? size : 600;
}
function applyCanvasMetrics(size) {
  SCREEN_WIDTH = size;
  SCREEN_HEIGHT = size;
  DISC_DIAMETER = SCREEN_WIDTH * DISC_SIZE_RATIO;
  centreOfScreen = createVector(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
}

function setup() {
  const canvasSize = getCanvasTargetSize();
  createCanvas(canvasSize, canvasSize);
  applyCanvasMetrics(canvasSize);
  angleMode(RADIANS);
  dotColor = createVector(28, 82, 92);

  geometryLoad();

  // initialize the starting partition
  partition = "(1 4)(2 3)(5 7 8 12)(6)(9 10 11)"; // std-text
  partedArray = partitionToArr(partition); //std-list
  krewArr = getKrewerasComplement(partedArray); //kr-list
  krewStr = arrToString(krewArr); //kr-text

  textFont(myFont);
  isComplement = false;
  precomputeCurveData(partedArray);
  isValid = true;
  errorVal = "";

  //Annular stuff
  annularRadio = createRadio();
  annularRadio.position(0, 0); 
  annularRadio.size(1000);

  annularRadio.option('disc');
  annularRadio.option('annular');
  annularRadio.selected('disc');
}

function windowResized() {
  const canvasSize = getCanvasTargetSize();
  resizeCanvas(canvasSize, canvasSize);
  applyCanvasMetrics(canvasSize);
  if (partField !== null) {
    partField.position(SCREEN_WIDTH * (3 / 15), SCREEN_HEIGHT * 0.5);
    partField.size(SCREEN_WIDTH * (9 / 15));
  }
  if (submitButton !== null && partField !== null) {
    submitButton.position(
      SCREEN_WIDTH * (3 / 15) + partField.width + 10,
      SCREEN_HEIGHT * 0.5
    );
  }

  if(!isComplement) {
    precomputeCurveData(partedArray);
  }
  else { 
    precomputeCurveData(krewArr);
  }

}

let myFont;
function preload() {
  myFont = loadFont("Libertnius.ttf");
}

function keyPressed() {
  // If SPACE is pressed toggle between the partition and its Kreweras complement
  if (key === " ") {
    if (!isTyping) {
      isComplement = !isComplement;
      if(isComplement)
      {
        precomputeCurveData(krewArr);
      }else{
        precomputeCurveData(partedArray);
      }
    }
  }

  // If ENTER is pressed, toggle into input mode or submit if already typing
  if (keyCode === ENTER) {
    if (!isTyping) {
      isTyping = true;
      // create input UI immediately
      drawTextbox();
      print("Typing mode ON");
    } else {
      // If already typing, treat ENTER as submit
      updatePartition();
      print("Typing mode SUBMIT");
    }
  }
}


function drawTextbox(){
  // Only create the input and button once when entering typing mode
  if (partField !== null) {
    // already created
    return;
  }

  // draw instruction text
  textSize(20);
  fill(0);
  noStroke();
  text("Please enter the partition below (e.g. (1 4)(2 3)):", SCREEN_WIDTH/9, SCREEN_HEIGHT*(5/14));

  // create input field
  partField = createInput();
  partField.attribute('placeholder', 'enter partition, e.g. (1 4)(2 3)');
  partField.position(SCREEN_WIDTH*(3/15), SCREEN_HEIGHT*(0.5));
  partField.size(SCREEN_WIDTH*(9/15));
  partField.style('font-size', '18px');
  partField.style('padding', '6px');
  partField.style('border', '2px solid #000');
  partField.style('border-radius', '4px');
  partField.style('box-shadow', '1px 1px 3px rgba(0,0,0,0.3)');
  partField.style('outline', 'none');
  partField.style('background-color', '#fff');
  partField.style('color', '#000');
  partField.style('text-align', 'center');
  partField.style('font-family', 'Libertinius, sans-serif');
  partField.style('font-weight', 'bold');
  partField.style('z-index', '10');

  // Focus so user can start typing immediately
  partField.elt.focus();

  // submit on change (e.g. Enter inside input) or via button
  partField.changed(updatePartition);

  // create submit button
  submitButton = createButton('Submit');
  submitButton.position(SCREEN_WIDTH*(3/15) + partField.width + 10, SCREEN_HEIGHT*(0.5));
  submitButton.mousePressed(updatePartition);
  submitButton.style('font-size', '16px');
  submitButton.style('padding', '6px 10px');
  submitButton.style('z-index', '10');
}

//Annular anaologue to updatePartition
function updatePermutation(){

}

function updatePartition(){
  // If the UI doesn't exist, nothing to do
  if (partField === null && submitButton === null) {
    isTyping = false;
    return;
  }

  // Read value (if any)
  let newPartition = "";
  if (partField !== null) {
    newPartition = partField.value().trim();
  }

  // Remove UI elements
  if (partField !== null) {
    partField.remove();
    partField = null;
  }
  if (submitButton !== null) {
    submitButton.remove();
    submitButton = null;
  }

  isTyping = false;

  if (newPartition.length === 0) {
    // If user submitted empty string, keep previous partition (or you could clear)
    isValid = false;
    errorVal = ERROR_EMPTY;
    return;
  }

  let newPartedArray = partitionToArr(newPartition);
  if (isValidPartition(newPartedArray)) {
    //Reinstate partition
    partition = newPartition; // text partition
    partedArray = newPartedArray; // list partition
    //Store new Kreweras complement
    krewArr = getKrewerasComplement(partedArray); //list partition
    krewStr = arrToString(krewArr); // text partition

    isValid = true;
    errorVal = "";
    //Toggle back to the non Kr complement
    isComplement = false;
    //Precompute the Curve Data for the parted array
    precomputeCurveData(partedArray);
  } else {
    isValid = false;
    // partedArray remains unchanged
  }
}


function draw() {
  background(220);

  if(!isValid){
    fill(255,0,0);
    textSize(30);
    text("Invalid Partition", SCREEN_WIDTH/2 - textWidth("Invalid Partition")/2, SCREEN_HEIGHT/2);
    text(errorVal, SCREEN_WIDTH/2 - textWidth(errorVal)/2, SCREEN_HEIGHT/2 + 25);
  } else {
    if (annularRadio.value() === 'annular') {
      text(`p = ${outer_p}`, 20, 30)
      text(`q = ${inner_q}`, 20, 50)  
      drawBoundary(outer_p, inner_q);
      //Then draw o-o edges
      //then i-i edges
      //then o-i edges
    } else {
      const n = partedArray.length;
      drawBoundary(n);
      //Then draw edges
    }

    //Output current permutation
    strokeWeight(1);
    if (!isComplement) {
      //TODO: store regular stroke and fill values as a global constant at the top
      stroke(0);
      fill(0);
      text(`π = ${partition}`, SCREEN_WIDTH - textWidth(`π = ${partition}`)/2, SCREEN_HEIGHT - 10);
    } else {
      //TODO: store Kreweras complement stroke and fill values as a globabl constant at the top
      stroke(219, 2, 49);
      fill(219, 2, 49 );
      // that weird red block is thin space which is smaller than regular space
      text(`Kr (π) = ${krewStr}`, SCREEN_WIDTH - textWidth(`Kr (π) = ${krewStr}`) + 10, SCREEN_HEIGHT - 10);
    } 
  }
}
