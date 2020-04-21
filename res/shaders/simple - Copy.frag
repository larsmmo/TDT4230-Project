#version 430 core

struct PointLight {    
    vec3 position;
    vec3 color;
};

struct DirectionalLight {    
    vec3 dir;
    vec3 color;
};

vec3 objectColors[] = {
	{0.2, 0.8, 0.3},	// Grass color
	{0.8, 0.7, 0.8},	// Column color
	{0.7, 0.7, 0.6},	// Floor color
	{0.8, 0.7, 0.8},	// Roof color
	{0.5, 0.7, 0.7}//{0.7, 0.9, 0.7}		// Sea color
	};

#define FLT_MAX 3.402823466e+38
#define PI 3.1415926535897932384626433832795

#define MAX_LIGHTS 3

uniform layout(location = 0) vec2 imageResolution;

uniform layout(location = 1) float time;

uniform layout(location = 2) vec3 cameraPosition;

uniform layout(location = 3) mat4 rotMatrix;

uniform layout(location = 4) int numLights;

uniform PointLight pointLights[MAX_LIGHTS];

const float ambientStrength = 0.35;
const float specularStrength = 0.25;

const float constant = 1.0;
const float linear = 0.020;
const float quadratic = 0.0015;

const float FOV = 2.0;

const vec3 SEA_COLOR = vec3(0.7, 0.9, 0.7);
const float MAX_HEIGHT_SEA = 5.0;

out vec4 color;
/*======================================================================================*/
// Noise functions

float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }	// from gloom
float dither(vec2 uv) { return (rand(uv)*2.0-1.0) / 256.0; }

// Smoothstep interpolation generates a smooth output from an input between 0 and 1
float interpolateNoise(in vec2 point)
{
	vec2 i = floor(point);
    vec2 f = fract(point);
	vec2 u = f*f * (3.0 - 2.0 * f);

	return -1.0+2.0*mix( 
                mix( rand(i + vec2(0.0,0.0)), 
                     rand(i + vec2(1.0,0.0)), 
                     u.x),
                mix( rand(i + vec2(0.0,1.0)), 
                     rand(i + vec2(1.0,1.0)), 
                     u.x), 
                u.y);
}

float generateOctave(vec2 uv, float choppiness)
{
	uv += interpolateNoise(uv);
	
	//Feed noise through wave functions (cos and sine)
	vec2 wave = 1.0 - abs(sin(uv));					// For point peaks
	vec2 wave2 = abs(cos(uv));						// For curvy peaks
	wave = mix(wave, wave2, wave);					// Blend waves

	return pow(1.0-pow(wave.x * wave.y,0.65), choppiness);		// Get height value from wave functions and make waves choppy
}

/*======================================================================================*/
// SDF operations

vec2 opIntersect(vec2 distA, vec2 distB) {
    return (distA.x > distB.x) ? distA : distB;
}

vec2 opUnion(vec2 distA, vec2 distB) {
    return (distA.x < distB.x) ? distA : distB;
}

vec2 opDifference(vec2 distA, vec2 distB) {
    return (distA.x > -distB.x) ? distA : vec2(-distB.x, distB.y);
}

float opOnion(in float sdf, in float thickness)
{
    return abs(sdf) - thickness;
}

float opRound(in float SDFdist, in float rad )
{
    return SDFdist - rad;
}

vec3 opRepeatInf(in vec3 point, in vec3 period)
{
	return mod(point + 0.5 * period, period) - 0.5 * period;
}

vec3 opRepeatLim(in vec3 point, in float period, in vec3 length)
{
    return (point - period *clamp(round(point / period), -length, length));
}

//Soft Min function (continuous) Inspired by : https://www.iquilezles.org/www/articles/smin/smin.htm
vec2 sMin(vec2 distA, vec2 distB, float k)
{
    float h = max(k - abs(distA.x - distB.x), 0.0) / k;
    return (distA.x < distB.x) ? vec2(distA.x - h*h*h * k * (1.0/6.0), distA.y) : vec2(distB.x - h*h*h * k * (1.0/6.0), distB.y) ;
}
/*======================================================================================*/
// Signed distance functions (SDF)

float sphereSDF(vec3 p, float radius)
{
    return length(p) - radius;
}

float boxSDF(vec3 p, vec3 size ) {
     vec3 d = abs(p) - size;
     return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

float cylinderSDF(vec3 p, float radius, float len)
{
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(len, radius);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float torusSDF(vec3 point, vec2 thickness)
{
  vec2 q = vec2(length(point.xz) - thickness.x, point.y);
  return length(q) - thickness.y;
}
/*======================================================================================*/

vec2 mapWorld(in vec3 point)
{
	
	// Ground
	vec3 groundLevel = vec3(0.0, -7.0, 0.0);
    vec2 res = vec2(boxSDF(point - groundLevel,  vec3(25.0, 1.0, 25.0)), 0.0);  // vec2 = [distance, ObjectID]

	/*---------- Roman Column -----------*/
	vec3 columnPoint = opRepeatLim(point, 4.35, vec3(2.0, 0.0, 1.0));
	columnPoint = vec3(columnPoint.x, abs(columnPoint.y) + 0.2, columnPoint.z);
	float angle = 2 * PI / 24.0;
	float sector = round(atan(columnPoint.z, columnPoint.x)/angle);
	vec3 rotatedPoint = columnPoint;
	rotatedPoint.xz = mat2(cos(sector * angle), -sin(sector * angle),
							sin(sector*angle), cos(sector*angle)) * (rotatedPoint.xz);

		// Big column carved out by smaller ones
	vec2 column = opDifference(vec2(cylinderSDF(columnPoint - vec3(0.0, 0.0, 0.0), 2.0, 0.3), 1.0), vec2(cylinderSDF(rotatedPoint - vec3(0.3, 0.0, 0.0), 2.0, 0.02), 1.0));

		// Cylinder top
	column = sMin(column, opDifference(vec2(cylinderSDF(columnPoint - vec3(0.0, 2.0, 0.0), 0.05, 0.45) - 0.02, 1.0), vec2(torusSDF(columnPoint - vec3(0.0, 1.80, 0.0), vec2(0.63, 0.29)), 1.0)), 0.5);

		// Box top
	column = opUnion(column, vec2(boxSDF(columnPoint - vec3(0.0, 2.14, 0.0),  vec3(0.5, 0.08, 0.5)) - 0.02, 1.0));

	column = opDifference(column, vec2(boxSDF(point - vec3(0.0, 0.0, 5.0),  vec3(10.0, 2.5, 2.0)), 1.0));		// Remove one row of columns
	
	res = opUnion(res, column);
	
	/*---------- First level floor -----------*/
	vec3 floorPoint = opRepeatLim(point - vec3(0.0, -2.0, -2.90), 1.45, vec3(7.0, 0.0, 3.0));
	vec2 floor = vec2(boxSDF(floorPoint,  vec3(0.7, 0.05, 0.7)) - 0.03, 2.0);
	floor = opDifference(floor, vec2(boxSDF(point - vec3(0.0, -2.0, -7.27),  vec3(11.0, 0.5, 0.75)), 2.0));		// Remove one row of tiles

	res = opUnion(res, floor);

	/*---------- First level roof -----------*/
	vec3 roofOrigin = vec3(0.0, 2.1, -2.2);
	vec2 roof = vec2(boxSDF(point - roofOrigin,  vec3(9.6, 0.1, 3.0)) - 0.03, 3.0);

	res = opUnion(res, roof);

	return res;
}

// Computes distance straight down to sea from a given point (y-direction)
float getSeaDist(vec3 point)
{
	vec2 uv = vec2(point.x * (3/4), point.z);		// xy-grid for heightmap

	float frequency = 0.16;
	float amplitude = 0.6;

	float wave = 0.0;
	float height = 0.0;
	float choppiness = 4.0;

	for(int i = 0; i < 4; i++)
	{
		wave = generateOctave((uv + time) * frequency, choppiness);		// Vary with time for movement
		wave += generateOctave((uv + time) * frequency, choppiness);
		height += wave * amplitude;
		uv *= mat2(1.6,1.2,-1.2,1.6);		// Create assymmetry

		amplitude *= 0.22;					// Finer detail in later iterations -> decrease amplitude and frequency
		frequency *= 1.9;		

		choppiness = mix(choppiness, 1.0, 0.20);		// Make wave shapes differ from iteration to iteration
	}

	return (point.y - height) + 2.7;		// +2.7 sets sea level
}

/* Function that computes the normal by calculating the gradient of the distance field at given point */
vec3 calculateNormal(in vec3 point)
{
    const vec3 perturbation = vec3(0.001, 0.0, 0.0);

    float gradX = mapWorld(point + perturbation.xyy).x - mapWorld(point - perturbation.xyy).x;
    float gradY = mapWorld(point + perturbation.yxy).x - mapWorld(point - perturbation.yxy).x;
    float gradZ = mapWorld(point + perturbation.yyx).x - mapWorld(point - perturbation.yyx).x;

    vec3 normal = vec3(gradX, gradY, gradZ);

    return normalize(normal);
}

/* Need a separate function to calculate normals for sea (for now) */
vec3 calculateSeaNormal(in vec3 point)
{
	const float perturbation = 0.001;

	vec3 normal;
	float height = getSeaDist(point);
	normal.y = getSeaDist(vec3(point.x, point.y + perturbation, point.z)) - height;
	normal.x = getSeaDist(vec3(point.x + perturbation, point.y, point.z)) - height;
	normal.z = getSeaDist(vec3(point.x, point.y, point.z + perturbation)) - height;

	return normalize(normal);
}

/*======================================================================================*/

vec3 phongShading(in vec3 currentPos, int candidateObj, in vec3 ray)
{
	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

	vec3 normal = calculateNormal(currentPos);

	for (int i = 0; i < numLights; i++)
	{
		vec3 lightDir = normalize(pointLights[i].position - currentPos);
		vec3 reflectDir = normalize(reflect(-lightDir, normal));

		float lightDistance = length(pointLights[i].position - currentPos);
		float lightAttenuation = 1.0 / (constant + linear * lightDistance + quadratic * (lightDistance * lightDistance));

		float diff = clamp(max(dot(lightDir, normal), 0.0) * lightAttenuation, 0.0, 1.0);
		float spec = clamp(pow(max(dot(normalize(ray), reflectDir), 0.0), 32) * lightAttenuation, 0.0, 1.0); 

		ambient += ambientStrength * pointLights[i].color * lightAttenuation;
		diffuse += diff * pointLights[i].color;
		specular += specularStrength * spec * pointLights[i].color;
	}

	vec3 combined = (ambient + diffuse) * objectColors[candidateObj] + specular;

	return combined;
}

vec3 getSkyColor(in vec3 rayDir)
{
	// Create gradient for sky color. Brighter blue at horizon.
	vec3 col = vec3(0.4, 0.5, 0.9)- rayDir.y * vec3(0.3, 0.3, 0.5);

	return col;
}

vec3 getSeaColor(in vec3 point, in vec3 cameraPos, in vec3 currentPos, in vec3 ray)
{
	vec3 normal = calculateNormal(currentPos);

	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

	float fresnel = 1.0 - max(dot(normal, -cameraPos), 0.0);		// Fresnel allows more reflection when camera is looking at sea with a low angle
    fresnel = pow(fresnel, 3.0) * 0.65;

	for (int i = 0; i < numLights; i++)
	{
		vec3 lightDir = normalize(pointLights[i].position - currentPos);
		vec3 reflectDir = normalize(reflect(-lightDir, normal));

		float lightDistance = length(pointLights[i].position - currentPos);
		float lightAttenuation = 1.0 / (constant + linear * lightDistance + quadratic * (lightDistance * lightDistance));

		float diff = clamp(max(dot(lightDir, normal), 0.0) * lightAttenuation, 0.0, 1.0);
		float spec = clamp(pow(max(dot(normalize(ray), reflectDir), 0.0), 32) * lightAttenuation, 0.0, 1.0); 

		ambient += ambientStrength * pointLights[i].color * lightAttenuation;
		diffuse += diff * pointLights[i].color;
		specular += specularStrength * spec * pointLights[i].color;
	}

	/*
	vec3 refraction = vec3(0.1, 0.2, 0.25) + diffuse * SEA_COLOR * 0.12;
	vec3 reflection = getSkyColor(cameraPos, reflect(cameraPos, normal));		// Only sky reflection for now

	// Blend refraction and reflection based on angle between view dir and normal (fresnel)
	vec3 col = mix(refraction, reflection, fresnel) + ambient;

	// Light gets attenuated when traveling through water
	float waterAttenuation = max(0.0, 1.0 - (0.001 * dot(dist, dist));

	col += SEA_COLOR * (point-y - MAX_HEIGHT_SEA) * waterAttenuation * 0.2;
	
	col += specular;
	*/

	vec3 col = (ambient + diffuse) * SEA_COLOR + specular;

	return col;
}

vec3 rayMarch(in vec3 origin, in vec3 dir)
{
	const int N_STEPS = 150;
	const int N_STEPS_SEA = 10;
	const float MIN_HIT_DIST = 0.0001;
	const float MAX_RAY_DIST = 1000.0;

	float lh = 0.0f;
    float ly = 0.0f;

	int step = 0;

	vec3 currentPos = origin;
	vec2 toClosestDist = mapWorld(currentPos);
	float distTraveled = 0.0;

	vec3 candidatePos = origin;
	float candidateError = FLT_MAX;
	int candidateObj = 0;

	// First we raymarch sea

	vec3 currentSeaPos = origin;
	float startHeight = getSeaDist(currentPos);
	float stepSize = 0.0;
	float farDist = 1000.0;
	float nearDist = 0.0;
	float seaDist = FLT_MAX;

	// If point at max distance along ray is above water, we know that the ray will hit sky or an object, so we can skip sea tracing
	float maxSeaDist = getSeaDist(currentPos + farDist * dir);
	if (maxSeaDist > 0.0) {
		return getSkyColor(dir); //step = N_STEPS_SEA +1;
		}

	while (step < N_STEPS_SEA)
	{
	
		// The size of the step we take depends on the height of the camera above the sea.
		// If the camera is close to sea-level, then take smaller steps. If it is far above, we can take bigger steps without hitting anything.
		// Also, if we are looking straight down at the sea we take smaller steps, and bigger if we are looking at horizon.
		//		- Intersection between sea and ray can be very far along the ray if we are looking at the horizon.

		stepSize = mix(nearDist, maxSeaDist, startHeight / (startHeight - maxSeaDist));

		// Current position along ray from the origin
        currentSeaPos = origin + dir * stepSize;

		float newDist = getSeaDist(currentPos);

		if (newDist < 0.0){			// New point is below water -> go forward less next iteration by decreasing stepsize
			farDist = stepSize;
			maxSeaDist = newDist;
		} else {						// Point is above water => keep going by increasing stepsize
			nearDist = stepSize;
			startHeight = newDist;
		}
		seaDist = stepSize;				// Distance from camera to sea hit
		step++;
	}
	return calculateSeaNormal(currentSeaPos);
}
	/*
	// Now we raymarch objects
	step = 0;
	while (toClosestDist.x > MIN_HIT_DIST && step < N_STEPS && distTraveled < seaDist)		// Terminate if at max distance, steps are exceeded, or the sea is in front of any object
	{
		
		// Current position along ray from the origin
        currentPos = origin + distTraveled * dir;

        // Find distance from current position to closest point on a sphere
        toClosestDist = mapWorld(currentPos);
		distTraveled += toClosestDist.x;

		// Use smallest circle in case of ray termination due to steps
		candidateError = min(candidateError, toClosestDist.x);
		candidatePos = (candidateError < toClosestDist.x) ? candidatePos : origin + distTraveled * dir;
		candidateObj = (candidateError < toClosestDist.x) ? int(candidateObj) : int(toClosestDist.y);

		step++;
	}
	
	return (toClosestDist.x > MAX_RAY_DIST) ? getSkyColor(dir) : phongShading(currentSeaPos, 4, normalize(origin - currentSeaPos));
}
*/

/*======================================================================================*/
void main()
{
	// Generating a ray from the camera (origin) through every pixel

	// Move center to (0,0)
	vec2 fragPos = (gl_FragCoord.xy/ imageResolution.xy) * 2.0 - 1.0;
	// Correct for image aspect ratio
	fragPos.x *= imageResolution.x / imageResolution.y;

	vec3 rayDir = vec3(inverse(rotMatrix) * vec4(vec3(fragPos, FOV), 1.0));

	float dither = dither(fragPos);

	color = vec4(rayMarch(cameraPosition, normalize(rayDir)) + dither, 1.0);
}