#version 430 core

in GS_OUT {
	vec3 normal;
	vec2 textureCoordinates;
	vec3 fragPos;
	vec3 position;
} fs_in;

struct PointLight {    
    vec3 position;
    vec3 color;
};

#define MAX_LIGHTS 3

uniform PointLight pointLights[MAX_LIGHTS];

uniform samplerCube depthMap[MAX_LIGHTS];

uniform layout(location = 6) int numLights;

uniform layout(location = 10) vec3 cameraPosition;

out vec4 color;

float ambientStrength = 0.2;
float specularStrength = 1.0;

float constant = 1.0;
float linear = 0.028;
float quadratic = 0.0020;

float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }
float dither(vec2 uv) { return (rand(uv)*2.0-1.0) / 256.0; }

// Perpendicular offset directions for use in sampling when smoothing out jagged shadows
vec3 sampleOffsetDirections[20] = vec3[]
(
   vec3( 1,  1,  1), vec3( 1, -1,  1), vec3(-1, -1,  1), vec3(-1,  1,  1), 
   vec3( 1,  1, -1), vec3( 1, -1, -1), vec3(-1, -1, -1), vec3(-1,  1, -1),
   vec3( 1,  1,  0), vec3( 1, -1,  0), vec3(-1, -1,  0), vec3(-1,  1,  0),
   vec3( 1,  0,  1), vec3(-1,  0,  1), vec3( 1,  0, -1), vec3(-1,  0, -1),
   vec3( 0,  1,  1), vec3( 0, -1,  1), vec3( 0, -1, -1), vec3( 0,  1, -1)
);

// PCF algorithm for softer shadows. Uses average of multiple samples around fragment position to smooth out jagged edges. Uses the offset directions
// defined above to sample in directions perpendicular to the sample direction vector
float calculateShadow(vec3 fragPos, vec3 lightPosition, int lightID)
{
	vec3 fragLightVec = fragPos - lightPosition;
	float currentDepth = length(fragLightVec);

	float shadow = 0.0;
	float bias   = 0.1;
	int samples  = 20;
	float viewDistance = length(cameraPosition - fs_in.fragPos);
	float diskRadius = (1.0 + (viewDistance / 350.0)) / 25.0;			// Sharper shadows when close to the viewer, and softer when far away
	for(int i = 0; i < samples; ++i)
	{
		float closestDepth = texture(depthMap[lightID], fragLightVec + sampleOffsetDirections[i] * diskRadius).r;
		closestDepth *= 350.0;			// from [0,1] to original value (350.0 = far plane of view frustrum from light POV)

		if(currentDepth - bias > closestDepth)
			shadow += 1.0;
	}
	shadow /= float(samples); 
    return shadow;
}  

void main()
{
	vec3 norm = normalize(fs_in.normal);						

	vec3 viewDir = normalize(cameraPosition - fs_in.fragPos);

	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

	for (int i = 0; i < numLights; i++){
		vec3 lightDir = normalize(pointLights[i].position - fs_in.fragPos);									// Is it better to declare the variables outside of loop to avoid construction and destruction? (better performance?)
		vec3 reflectDir = reflect(-lightDir, norm);

		float lightDistance = length(pointLights[i].position - fs_in.fragPos);
		float lightAttenuation = 1.0 / (constant + linear * lightDistance + quadratic * (lightDistance * lightDistance));

		float shadow = calculateShadow(fs_in.fragPos, pointLights[i].position, i);

		float diff = max(dot(norm,lightDir), 0.0) * lightAttenuation * (1 - shadow);
		float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32) * lightAttenuation * (1 - shadow); 

		ambient += ambientStrength * pointLights[i].color * lightAttenuation;
		diffuse += diff * pointLights[i].color;
		specular += specularStrength * spec * pointLights[i].color;
	}

	float dither = dither(fs_in.textureCoordinates);

	vec3 combined = (ambient + diffuse) * vec3(0.99, 0.99, 0.99) + specular + dither;					// last vector = object color
	color = vec4(combined, 1.0);
}