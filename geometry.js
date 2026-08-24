let startPos = [];
let endPos = [];
let controlOne = [];
let controlTwo = [];
let textPos = [];
let dotPos = [];
let pts = [];
let norms = [];
let s = [];
let totalLen = 0;

function geometryLoad() {
  resetGeometryData();
}

function resetGeometryData() {
  startPos = [];
  endPos = [];
  controlOne = [];
  controlTwo = [];
  textPos = [];
  dotPos = [];
  pts = [];
  norms = [];
  s = [];
  totalLen = 0;
}

function layoutPointsOnCricle(
  cx,
  cy,
  radius,
  count,
  startAngleOrClockwise = -HALF_PI,
  maybeClockwise
) {
    let startAngle = -HALF_PI;
    let clockwise = true;

    if (typeof startAngleOrClockwise === "number") {
        startAngle = startAngleOrClockwise;
    } else if (typeof startAngleOrClockwise === "boolean") {
        clockwise = startAngleOrClockwise;
    }

    if (typeof maybeClockwise === "boolean") {
        clockwise = maybeClockwise;
    }

    const points = [];
    const step = (clockwise ? TWO_PI : -TWO_PI) / count;

    for (let i = 0; i < count; i++) {
        const angle = startAngle + i * step;
        const x = cx + radius * cos(angle);
        const y = cy + radius * sin(angle);
        points.push({ x, y, index: i + 1, angle });
    }

    return points;
}

function drawBoundaryCircle(cx, cy, radius){
    noFill();
    strokeWeight(3);
    stroke(dotColor.x, dotColor.y, dotColor.z);
    circle(cx, cy, 2*radius);
}

function drawLabeledPoints(points, dotRadius = 5, labelOffset = 20){
    textAlign(CENTER, CENTER);
    textSize(16);
    for (const p of points){
        //dot
        fill(0);
        circle(p.x, p.y, dotRadius);
        
        //label slightly away from the boundary along the angle
        const lx = p.x + labelOffset*cos(p.angle);
        const ly = p.y + labelOffset*sin(p.angle);
        
        noStroke();
        text(p.index, lx, ly);
    }
}

function drawDiscBoundary(n){
    const cx = width / 2;
    const cy = height / 2;
    const R = min(width, height) * 0.4;

    stroke(0);  
    // geometric primitives
    drawBoundaryCircle(cx, cy, R);
    const points = layoutPointsOnCricle(cx, cy, R, n);
    drawLabeledPoints(points);
}


function drawAnnulusBoundary(p, q){
    const cx = width / 2;
    const cy = height / 2;
    const R_outer = min(width, height) * 0.4;
    const R_inner = R_outer * 0.45;

    stroke(0);
    // two circles
    drawBoundaryCircle(cx, cy, R_outer);
    drawBoundaryCircle(cx, cy, R_inner);

    const outerPoints = layoutPointsOnCricle(cx, cy, R_outer, p);
    const innerPoints = layoutPointsOnCricle(cx, cy, R_inner, q, -HALF_PI, false);

    drawLabeledPoints(outerPoints);
    drawLabeledPoints(innerPoints, 5, -15);
}

function drawBoundary(p, q = null){
    if (q == null){
        drawDiscBoundary(p);
    } else {
        drawAnnulusBoundary(p, q);
    }
}

function outerOuterEdges(){

}

function solveCentre(x1, y1, x2, y2, R_bound){
  const b1 = R_bound **2;
  const b2 = b1;

  //determinatn of 2x2 matrix A
  const det = x1*y2 - y1*x2;

  if(Math.abs(det) < 1e-9){
    return {center: null, radius: null};
  }

  //Cramer's rule for 2x2
  const cx = (b1 * y2 - b2*y1) /det;
  const cy = (x1 * b2 - x2*b1) / det;

  // Radius = ||center - p1||
  const dx = cx - x1;
  const dy = cy - y1;
  const rad = Math.sqrt(dx**2 + dy**2);

  return { centre: createVector(cx, cy), radius}; 
}

function getOrthoArc(p1, p2, R_bound){
  let x1, y1 = p1;
  let x2, y2 = p2;
  if (abs(x1 + x2) < 1e-5 && abs(y1+y2) < 1e-5){
    return null, null;
  }

  // Centre of ortho circle is intersection of tangets to the boundary at p1, p2.
  // tangent line at p1 is x*x1 + *y1 = R^2

  return solveCentre(x1, y1, x2, y2, R_bound);
}

function outArc(p1, p2, R_bound, colour){
  let result = getOrthoArc(p1, p2, R_bound);
  if (result.centre !== null){
    let c = result.centre;
    let r = result.rad;

    let ang1 = atan2(p1.y - c.y, p1.x - c.x);
    let ang2 = atan2(p2.y - c.y, p2.x - c.x);

    //midpoint logic to determine correct arc segment
    let midChord = p5.Vector.add(p1,p2);
    midChord = midChord.div(2);
    let vec = p5.Vector.sub(midChord, c);

    //normalize
    if (sqrt(vec.x**2 + vec.y^2) < 1e-9){
      vec = createVector(1, 0);
    } else {
      vec = (vec.div(sqrt(vec.x**2 + vec.y^2))).mult(r);
    }

    let midArc = c.add(vec);
    let dist = sqrt(midArc.x**2 + midArc.y**2);

    //flip logic
    let isOuter = (abs(R_bound- R_outer) < 1e-5);

    //If we are drawing on outer bounder we want arc to go IN (dist < R_outer)
    //If we are drawing on inner boundary, we want arc to go OUT (dist > R_outer)

    if (isOuter){
      if (dist > R_bound){
        midArc = c.sub(vec);
      }
    } else {
      if (dist < R_bound){
        midArc = c.sub(vec);
      }
    }

    //Recalculate angles and directions 
    let v1 = p1.sub(c);
    let vm = midArc.sub(c);
    let cross = v1.x*vm.y - v1.y*vm.x;

    if (cross>0){ //CCW
      if (ang2 < ang1) { ang2 += 2*PI;}
      let ts = lerp(ang1, ang2,)
    }
  }
}

//Based on the permutation, generate the geometry data for each curve of each cycle
//Called at start, when toggled between complement, and a new entry is inputted
function precomputeCurveData(arr) {
  resetGeometryData();



  let angle = TWO_PI / arr.length;
  let angles = [];
  let s1 = [];
  for (let i = 0; i < arr.length; i++) {
    angles.push(HALF_PI - angle * i);
    s1.push(
      createVector(cos(angles[i]), sin(angles[i]))
    );
  }

  for (let j = 0; j < arr.length; j++) {
    let mapto = int(arr[j]) - 1;

    //Angles 
    let startAngle = angles[j];
    let endAngle = angles[mapto];
    let midAngle = (startAngle + endAngle) / 2;
    let q1Angle = (startAngle + endAngle) / 4;
    let q2Angle = (3 * (startAngle + endAngle)) / 4;

    //Positions on S1
    let startingPos = s1[j];
    let endingPos = s1[mapto];

    let offset = createVector(
      (DISC_DIAMETER / 2) * startingPos.x,
      (DISC_DIAMETER / 2) * startingPos.y
    );  

    let endOffset = createVector(
      (DISC_DIAMETER / 2) * endingPos.x,
      (DISC_DIAMETER / 2) * endingPos.y
    );


    //dot position data
    dotPos.push(createVector(centreOfScreen.x + offset.x, centreOfScreen.y - offset.y,));
    //text position data
    textPos.push(createVector(centreOfScreen.x + TEXT_OFFSET * offset.x,
       centreOfScreen.y - TEXT_OFFSET * offset.y));
    


    startPos.push(createVector(centreOfScreen.x + offset.x,
        centreOfScreen.y - offset.y));
    endPos.push(createVector(centreOfScreen.x + endOffset.x,
        centreOfScreen.y - endOffset.y))

    // TODO: actually change from a Bezier model to Jacobi elliptic function
    //  approximated by Hyperbolic functions
    //TODO: add conditional where the points are antipodal as it draws straight lines and not bends
    // In general this code is kind of wonky and there shouldn't be any conditionals, other than possibly the self-loop
    // based on which vertex is being mapped to which one, adjust the control Bezier location
    if (j < mapto || (j == arr.length-1 && mapto == 0)) { //TIGHTER-ASCENDING-CURVE
      controlOne.push(createVector(centreOfScreen.x + offset.x * BEZI_SCALE,
        centreOfScreen.y - offset.y * BEZI_SCALE));
      controlTwo.push(createVector(centreOfScreen.x + endOffset.x * BEZI_SCALE,
        centreOfScreen.y - endOffset.y * BEZI_SCALE));
    } else if (j > mapto) { //LONGER-RETURN-CURVE
      controlOne.push(createVector(centreOfScreen.x + offset.x * 0.45,
        centreOfScreen.y - offset.y * 0.45));
      controlTwo.push(createVector(centreOfScreen.x + endOffset.x * 0.45,
        centreOfScreen.y - endOffset.y * 0.45));
    } else if (j == mapto) { // SELF-LOOPS
      let leftAngle = HALF_PI - (j-0.5) * angle;
      let rightAngle = HALF_PI - (j+0.5) * angle;
      let leftControl = createVector(cos(leftAngle), sin(leftAngle));
      let rightControl = createVector(cos(rightAngle), sin(rightAngle));
      controlOne.push(createVector(centreOfScreen.x + leftControl.x * DISC_DIAMETER * 0.4,
        centreOfScreen.y - leftControl.y * DISC_DIAMETER * 0.4));
      controlTwo.push(createVector(centreOfScreen.x + rightControl.x * DISC_DIAMETER * 0.4,
        centreOfScreen.y - rightControl.y * DISC_DIAMETER * 0.4));
    }

  }
}
