import { view } from '/js/modules/view.js';
import { tf } from '/js/modules/tf.js';
import { rosbridge } from '/js/modules/rosbridge.js';
import { settings } from '/js/modules/persistent.js';



let topic = "";
let listener = undefined;
let marker_topic = undefined;

let posemsg = undefined;

const scaleSlider = document.getElementById('{uniqueID}_scale');
const scaleSliderValue = document.getElementById('{uniqueID}_scale_value');

scaleSlider.addEventListener('input', function () {
	scaleSliderValue.textContent = this.value;
});

scaleSlider.addEventListener('change', saveSettings);

const selectionbox = document.getElementById("{uniqueID}_topic");
const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d');

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	topic = loaded_data.topic;

	scaleSlider.value = loaded_data.scale;
	scaleSliderValue.textContent = scaleSlider.value;
}

function saveSettings(){
	settings["{uniqueID}"] = {
		topic: topic,
		scale: parseFloat(scaleSlider.value)
	}
	settings.save();
}
//Rendering
function rgbaToFillColor(rosColorRGBA) {

	// Clamp the RGBA values between 0 and 1
	const r = Math.min(Math.max(rosColorRGBA.r, 0), 1);
	const g = Math.min(Math.max(rosColorRGBA.g, 0), 1);
	const b = Math.min(Math.max(rosColorRGBA.b, 0), 1);
	const a = Math.min(Math.max(rosColorRGBA.a, 0), 1);
  
	// Convert the RGBA values from the range [0, 1] to the range [0, 255]
	const r255 = Math.round(r * 255);
	const g255 = Math.round(g * 255);
	const b255 = Math.round(b * 255);
  
	// Return the RGBA color string for HTML canvas context
	return `rgba(${r255}, ${g255}, ${b255}, ${a})`;
}

function rgbaToStrokeColor(rosColorRGBA) {

	// Clamp the RGBA values between 0 and 1
	const r = Math.min(Math.max(rosColorRGBA.r, 0), 1);
	const g = Math.min(Math.max(rosColorRGBA.g, 0), 1);
	const b = Math.min(Math.max(rosColorRGBA.b, 0), 1);
  
	// Convert the RGBA values from the range [0, 1] to the range [0, 255]
	const r255 = Math.round(r * 255);
	const g255 = Math.round(g * 255);
	const b255 = Math.round(b * 255);

	console.log(rosColorRGBA)
  
	// Return the RGBA color string for HTML canvas context
	return `rgb(${r255}, ${g255}, ${b255})`;
}

function drawMarkers(){

	function drawArrow(marker, size){
		ctx.fillStyle = "rgba(255, 0, 0, 0.9)";
		const height = parseInt(size*marker.scale.x);
		const width = parseInt(size*0.1*marker.scale.y)+1;
		const tip = parseInt(size*0.2*marker.scale.x)+1;
		const tipwidth = parseInt(size*0.3*marker.scale.y)+1;

		ctx.beginPath();
		ctx.moveTo(0, -width);
		ctx.lineTo(height - tip, -width);
		ctx.lineTo(height - tip, -tipwidth);
		ctx.lineTo(height, 0);
		ctx.lineTo(height - tip, tipwidth);
		ctx.lineTo(height - tip, width);
		ctx.lineTo(0, width);
		ctx.lineTo(0, -width);
		ctx.fill();
	}
	
	function drawCovariance(posemsg, size) {
		const covariance = posemsg.pose.covariance;
	  
		// Extract the variance values for X and Y.
		const varianceX = covariance[0];
		const varianceY = covariance[7];
	  
		// Compute the standard deviation, which will be the radius for our ellipse.
		const radiusX = Math.sqrt(varianceX) * size;
		const radiusY = Math.sqrt(varianceY) * size;
	  
		// Draw the ellipse. The factor of 3 is used to ensure that the 99.7% confidence interval is included.
		ctx.save();
		ctx.scale(1, -1);
		ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'; // Yellow, semi-transparent
		ctx.beginPath();
		ctx.ellipse(0, 0, 3 * radiusX, 3 * radiusY, 0, 0, 2 * Math.PI);
		ctx.fill();
		ctx.restore();
	}

	const unit = view.getMapUnitsInPixels(1.0);

	const wid = canvas.width;
    const hei = canvas.height;

	ctx.clearRect(0, 0, wid, hei);


	if(!posemsg)
		return;

	ctx.fillStyle = rgbaToFillColor(posemsg.color);

	const frame = tf.absoluteTransforms[posemsg.header.frame_id];

	if(!frame)
		return;

	let transformed = tf.transformPose(
		posemsg.header.frame_id, 
		tf.fixed_frame, 
		posemsg.pose.pose.position, 
		posemsg.pose.pose.orientation
	);

	const pos = view.fixedToScreen({
		x: transformed.translation.x,
		y: transformed.translation.y
	});

	const yaw = transformed.rotation.toEuler().h;
	const scale = parseFloat(scaleSlider.value);

	ctx.save();
	ctx.translate(pos.x, pos.y);
	ctx.scale(1, -1);
	ctx.rotate(yaw);

	drawCovariance(posemsg, unit);
	drawArrow(posemsg, unit*scale);

	ctx.restore();
}

//Topic
function connect(){

	if(topic == "")
		return;

	if(marker_topic !== undefined){
		marker_topic.unsubscribe(listener);
	}

	marker_topic = new ROSLIB.Topic({
		ros : rosbridge.ros,
		name : topic,
		messageType : 'geometry_msgs/PoseWithCovarianceStamped'
	});
	
	listener = marker_topic.subscribe((msg) => {
		
		const q = msg.pose.pose.orientation;
		if(q.x == 0 && q.y == 0 && q.z == 0 && q.w == 0)
			msg.pose.pose.orientation = new Quaternion();
		
		msg.color = {r: 1, g: 0, b: 0, a: 1};
		msg.scale = {x: 2.0, y: 0.6, z: 1};
	
		posemsg = msg;
	
		drawMarkers();
	});

	saveSettings();
}

async function loadTopics(){
	let result = await rosbridge.get_topics("geometry_msgs/PoseWithCovarianceStamped");

	let topiclist = "";
	result.forEach(element => {
		topiclist += "<option value='"+element+"'>"+element+"</option>"
	});
	selectionbox.innerHTML = topiclist

	if(topic == "")
		topic = selectionbox.value;
	else{
		if(result.includes(topic)){
			selectionbox.value = topic;
		}else{
			topiclist += "<option value='"+topic+"'>"+topic+"</option>"
			selectionbox.innerHTML = topiclist
			selectionbox.value = topic;
		}
	}
	connect();
}

selectionbox.addEventListener("change", (event) => {
	topic = selectionbox.value;
	posemsg = undefined;
	connect();
});

selectionbox.addEventListener("click", (event) => {
	connect();
});

icon.addEventListener("click", (event) => {
	loadTopics();
});

loadTopics();

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawMarkers();
}

window.addEventListener("tf_changed", drawMarkers);
window.addEventListener("view_changed", drawMarkers);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

resizeScreen();

console.log("MarkerArray Widget Loaded {uniqueID}")
