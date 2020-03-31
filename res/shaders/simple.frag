#version 430 core

struct PointLight {    
    vec3 position;
    vec3 color;
};

struct DirectionalLight {    
    vec3 dir;
    vec3 color;
};


#define MAX_LIGHTS 3

uniform layout(location = 0) vec2 imageResolution;

uniform layout(location = 1) float time;

uniform layout(location = 2) vec3 cameraPosition;

uniform layout(location = 3) mat4 rotMatrix;

uniform layout(location = 4) int numLights;

uniform PointLight pointLights[MAX_LIGHTS];

const float ambientStrength = 0.35;
const float specularStrength = 0.5;

const float constant = 1.0;
const float linear = 0.020;
const float quadratic = 0.0015;

const float FOV = 2.0;

out vec4 color;

/*======================================================================================*/
// SDF operations

float opIntersect(float distA, float distB) {
    return max(distA, distB);
}

float opUnion(float distA, float distB) {
    return min(distA, distB);
}

float opDifference(float distA, float distB) {
    return max(distA, -distB);
}

float opOnion(in float sdf, in float thickness)
{
    return abs(sdf) - thickness;
}

float opRound(in float SDFdist, in float rad )
{
    return SDFdist - rad;
}


//Soft max function (continuous)
float sMax(float a, float b, float k)
{
    float h = max(k - abs(a - b), 0.0);
    return max(a, b) + h*h * 0.25 / k;
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

float cylinderSDF(vec3 p, float len, float radius )
{
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(len, radius);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
/*======================================================================================*/

float mapWorld(in vec3 point)
{
    float dist = boxSDF(point,  vec3(2.0));

	for (int light = 0; light < numLights; light++)
	{
		dist = opUnion(dist, sphereSDF(point - pointLights[light].position, 1.0));
	}

	dist = opUnion(dist, sphereSDF(point - vec3(5.0, 5.0, 0.0), 1.0));

    //return min(sphere0, sphere1);
	return dist;
}

/* Function that computes the normal by calculating the gradient of the distance field at given point */
vec3 calculateNormal(in vec3 point)
{
    const vec3 perturbation = vec3(0.001, 0.0, 0.0);

    float gradX = mapWorld(point + perturbation.xyy) - mapWorld(point - perturbation.xyy);
    float gradY = mapWorld(point + perturbation.yxy) - mapWorld(point - perturbation.yxy);
    float gradZ = mapWorld(point + perturbation.yyx) - mapWorld(point - perturbation.yyx);

    vec3 normal = vec3(gradX, gradY, gradZ);

    return normalize(normal);
}

/*======================================================================================*/

vec3 phongShading(in vec3 currentPos, in vec3 normal, in vec3 ray)
{
	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

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

	vec3 combined = (ambient + diffuse) * vec3(1.0, 1.0, 1.0) + specular;

	return combined;
}

vec3 getSkyColor(in vec3 rayDir, in vec3 sunPos)
{
	return vec3(0.0);
}

vec3 rayMarch(in vec3 origin, in vec3 dir)
{
	const int N_STEPS = 150;
	const float MIN_HIT_DIST = 0.0001;
	const float MAX_RAY_DIST = 10000.0;
	float distTraveled = 0.0;

	for (int i = 0; i < N_STEPS; i++)
	{
		// Current position along ray from the origin
        vec3 currentPos = origin + distTraveled * dir;

        // Find distance from current position to closest point on a sphere with radius = 1 from the origin
        float toClosestDist = mapWorld(currentPos);

        if (toClosestDist < MIN_HIT_DIST)	// Ray hit something
        {
			vec3 normal = calculateNormal(currentPos);

			vec3 col = phongShading(currentPos, normal, normalize(origin - currentPos));

            return col;
        }

        if (toClosestDist > MAX_RAY_DIST)	// Ray did not hit anything
        {
            break;
        }

		// Add to total distance traveled along ray
        distTraveled += toClosestDist;
	}

	//Nothing was hit. Returning background color
    return vec3(0.0);

}

/*======================================================================================*/
void main()
{
	// Generating a ray from the camera (origin) through every pixel

	// Move center to (0,0)
	vec2 fragPos = (gl_FragCoord.xy/ imageResolution.xy) * 2.0 - 1.0;
	// Correct for image aspect ratio
	fragPos.x *= imageResolution.x / imageResolution.y;

	vec3 rayDir = vec3(inverse(rotMatrix) * vec4(vec3(fragPos, FOV), 1.0));

	color = vec4(rayMarch(cameraPosition, normalize(rayDir)), 1.0);
}